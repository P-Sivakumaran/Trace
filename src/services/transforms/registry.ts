import { Entity, EntityType } from '@/types';
import {
  DiscoveredEntity,
  DiscoveredRelationship,
  TransformContext,
  TransformDefinition,
  TransformResult,
} from './types';
import { requestHttp } from './httpClient';

// Helper to clean domain input (strip protocol, paths, ports)
function cleanDomainName(raw: string): string {
  let cleaned = raw.trim().toLowerCase();
  cleaned = cleaned.replace(/^[a-z]+:\/\//i, '');
  cleaned = cleaned.split('/')[0];
  cleaned = cleaned.split(':')[0];
  cleaned = cleaned.replace(/^\.+|\.+$/g, '');
  return cleaned;
}

// Helper to calculate SHA-256 for Gravatar
async function sha256Hex(text: string): Promise<string> {
  const enc = new TextEncoder();
  const data = enc.encode(text);
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  // Fallback simple hash string if subtle is unavailable
  return text.toLowerCase();
}

/**
 * Registry of Maltego-inspired OSINT Transforms
 */
export const TRANSFORMS_REGISTRY: TransformDefinition[] = [
  // ==========================================
  // MALTEGO MACHINES (COMPOSITE WORKFLOWS)
  // ==========================================
  {
    id: 'machine_domain_footprint',
    name: 'Footprint Domain (Machine)',
    description: 'Comprehensive recon: Resolves A/AAAA records, finds MX & NS servers, tests common subdomains, and geolocates hosting IPs in a single automated pass.',
    category: 'Machines',
    entityTypes: ['domain'],
    iconName: 'ScanSearch',
    isMachine: true,
    run: async (entity, context) => {
      const domain = cleanDomainName(entity.name);
      context.log(`[Machine] Starting Domain Footprint on "${domain}"...`);

      const newEntities: DiscoveredEntity[] = [];
      const newRelationships: DiscoveredRelationship[] = [];

      // 1. Resolve A records
      context.log(`[Machine] Step 1/4: Resolving DNS A/AAAA records...`);
      try {
        const dohResp = await requestHttp<any>(
          `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=A`,
          { headers: { Accept: 'application/dns-json' } }
        );
        const answers = dohResp.data?.Answer || [];
        const ips: string[] = answers
          .filter((a: any) => a.type === 1 && a.data)
          .map((a: any) => a.data.trim());

        for (const ip of ips) {
          newEntities.push({
            name: ip,
            type: 'ip',
            attributes: { source_domain: domain, resolved_via: 'Cloudflare DoH' },
            tags: ['dns', 'ip'],
          });
          newRelationships.push({
            targetEntityName: ip,
            type: 'resolves_to',
            directed: true,
            status: 'confirmed',
            confidence: 1.0,
            evidence: [`DNS A record for ${domain}`],
          });
          context.log(`  -> Resolved IP: ${ip}`);

          // Instant geo-enrichment for discovered IP
          try {
            const geoResp = await requestHttp<any>(`http://ip-api.com/json/${ip}?fields=status,country,city,isp,org,as,lat,lon`);
            if (geoResp.data?.status === 'success') {
              const { country, city, isp, as: asn, lat, lon } = geoResp.data;
              const locName = [city, country].filter(Boolean).join(', ');
              if (locName) {
                newEntities.push({
                  name: locName,
                  type: 'location',
                  attributes: { latitude: lat, longitude: lon, country, city },
                  tags: ['geolocation'],
                });
                newRelationships.push({
                  targetEntityName: locName,
                  type: 'located_in',
                  directed: true,
                  status: 'confirmed',
                  confidence: 0.9,
                  evidence: [`IP-API geolocation for ${ip}`],
                });
              }
              if (isp || asn) {
                const ispName = isp || asn;
                newEntities.push({
                  name: ispName,
                  type: 'organization',
                  attributes: { asn, isp },
                  tags: ['isp', 'infrastructure'],
                });
                newRelationships.push({
                  targetEntityName: ispName,
                  type: 'hosted_by',
                  directed: true,
                  status: 'confirmed',
                  confidence: 0.95,
                  evidence: [`BGP ASN lookup for ${ip}`],
                });
              }
            }
          } catch (e) {
            // non-fatal geo error
          }
        }
      } catch (err: any) {
        context.log(`  [Warning] A record query failed: ${err.message}`);
      }

      // 2. Discover Mail Servers (MX)
      context.log(`[Machine] Step 2/4: Discovering MX mail servers...`);
      try {
        const mxResp = await requestHttp<any>(
          `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=MX`,
          { headers: { Accept: 'application/dns-json' } }
        );
        const mxAnswers = mxResp.data?.Answer || [];
        for (const ans of mxAnswers) {
          if (ans.type === 15 && ans.data) {
            const parts = ans.data.trim().split(/\s+/);
            const mxHost = cleanDomainName(parts[parts.length - 1]);
            if (mxHost) {
              newEntities.push({
                name: mxHost,
                type: 'domain',
                attributes: { priority: parts[0], role: 'Mail Exchange (MX)' },
                tags: ['mx', 'mail'],
              });
              newRelationships.push({
                targetEntityName: mxHost,
                type: 'mail_server',
                directed: true,
                status: 'confirmed',
                confidence: 1.0,
                evidence: [`MX record on ${domain}`],
              });
              context.log(`  -> Found MX Server: ${mxHost}`);
            }
          }
        }
      } catch (err: any) {
        context.log(`  [Warning] MX lookup error: ${err.message}`);
      }

      // 3. Discover Name Servers (NS)
      context.log(`[Machine] Step 3/4: Discovering authoritative Name Servers (NS)...`);
      try {
        const nsResp = await requestHttp<any>(
          `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=NS`,
          { headers: { Accept: 'application/dns-json' } }
        );
        const nsAnswers = nsResp.data?.Answer || [];
        for (const ans of nsAnswers) {
          if (ans.type === 2 && ans.data) {
            const nsHost = cleanDomainName(ans.data);
            if (nsHost) {
              newEntities.push({
                name: nsHost,
                type: 'domain',
                attributes: { role: 'Nameserver (NS)' },
                tags: ['dns', 'nameserver'],
              });
              newRelationships.push({
                targetEntityName: nsHost,
                type: 'nameserver',
                directed: true,
                status: 'confirmed',
                confidence: 1.0,
                evidence: [`NS record on ${domain}`],
              });
              context.log(`  -> Found Nameserver: ${nsHost}`);
            }
          }
        }
      } catch (err: any) {
        context.log(`  [Warning] NS lookup error: ${err.message}`);
      }

      // 4. Subdomain Scan (Top Common Subdomains)
      context.log(`[Machine] Step 4/4: Scanning common active subdomains...`);
      const candidateSubs = ['www', 'mail', 'api', 'dev', 'admin', 'vpn', 'portal', 'app', 'auth'];
      for (const sub of candidateSubs) {
        const fullSub = `${sub}.${domain}`;
        try {
          const subResp = await requestHttp<any>(
            `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(fullSub)}&type=A`,
            { headers: { Accept: 'application/dns-json' } }
          );
          if (subResp.data?.Answer?.length > 0) {
            newEntities.push({
              name: fullSub,
              type: 'domain',
              attributes: { parent_domain: domain, subdomain_prefix: sub },
              tags: ['subdomain'],
            });
            newRelationships.push({
              targetEntityName: fullSub,
              type: 'subdomain_of',
              directed: true,
              status: 'confirmed',
              confidence: 0.95,
              evidence: [`Active DNS A record found for ${fullSub}`],
            });
            context.log(`  -> Discovered active subdomain: ${fullSub}`);
          }
        } catch {
          // ignore missed subdomain
        }
      }

      context.log(
        `[Machine] Domain Footprint finished. Discovered ${newEntities.length} entities and ${newRelationships.length} relationships.`
      );

      return {
        newEntities,
        newRelationships,
        logs: [`Completed Footprint Machine on ${domain}`],
      };
    },
  },

  {
    id: 'machine_ip_threat_infra',
    name: 'IP Threat & Infrastructure (Machine)',
    description: 'Enriches an IP with Geolocation, Hosting ISP / Autonomous System (ASN), and Reverse DNS hostname in a single pass.',
    category: 'Machines',
    entityTypes: ['ip'],
    iconName: 'Server',
    isMachine: true,
    run: async (entity, context) => {
      const ip = entity.name.trim();
      context.log(`[Machine] Running IP Infrastructure Recon on "${ip}"...`);

      const newEntities: DiscoveredEntity[] = [];
      const newRelationships: DiscoveredRelationship[] = [];

      try {
        const geoResp = await requestHttp<any>(
          `http://ip-api.com/json/${ip}?fields=status,message,country,countryCode,region,regionName,city,zip,lat,lon,timezone,isp,org,as,query`
        );
        if (geoResp.data?.status === 'success') {
          const { country, regionName, city, isp, org, as: asn, lat, lon } = geoResp.data;
          const locString = [city, regionName, country].filter(Boolean).join(', ');
          if (locString) {
            newEntities.push({
              name: locString,
              type: 'location',
              attributes: { latitude: lat, longitude: lon, country, city, region: regionName },
              tags: ['geolocation'],
            });
            newRelationships.push({
              targetEntityName: locString,
              type: 'located_in',
              directed: true,
              status: 'confirmed',
              confidence: 0.95,
              evidence: [`IP-API geolocation database match for ${ip}`],
            });
            context.log(`  -> Geolocation: ${locString} (${lat}, ${lon})`);
          }

          const ispOrg = isp || org || asn;
          if (ispOrg) {
            newEntities.push({
              name: ispOrg,
              type: 'organization',
              attributes: { isp, organization: org, asn },
              tags: ['isp', 'network_provider'],
            });
            newRelationships.push({
              targetEntityName: ispOrg,
              type: 'hosted_by',
              directed: true,
              status: 'confirmed',
              confidence: 0.95,
              evidence: [`BGP routing table match for ${ip}`],
            });
            context.log(`  -> ISP / Organization: ${ispOrg}`);
          }
        } else {
          context.log(`  [Notice] IP-API returned status: ${geoResp.data?.message || 'unknown'}`);
        }
      } catch (err: any) {
        context.log(`  [Warning] Geolocation lookup failed: ${err.message}`);
      }

      // Reverse DNS via DoH PTR query
      try {
        context.log(`  -> Performing Reverse DNS lookup...`);
        const octets = ip.split('.');
        if (octets.length === 4) {
          const ptrName = `${octets[3]}.${octets[2]}.${octets[1]}.${octets[0]}.in-addr.arpa`;
          const ptrResp = await requestHttp<any>(
            `https://cloudflare-dns.com/dns-query?name=${ptrName}&type=PTR`,
            { headers: { Accept: 'application/dns-json' } }
          );
          const ptrAnswers = ptrResp.data?.Answer || [];
          for (const a of ptrAnswers) {
            if (a.type === 12 && a.data) {
              const host = cleanDomainName(a.data);
              if (host) {
                newEntities.push({
                  name: host,
                  type: 'domain',
                  attributes: { pointer_ip: ip },
                  tags: ['reverse_dns'],
                });
                newRelationships.push({
                  targetEntityName: host,
                  type: 'resolves_from',
                  directed: true,
                  status: 'confirmed',
                  confidence: 0.95,
                  evidence: [`PTR reverse DNS response for ${ip}`],
                });
                context.log(`  -> PTR Hostname: ${host}`);
              }
            }
          }
        }
      } catch (err: any) {
        context.log(`  [Warning] PTR lookup: ${err.message}`);
      }

      return {
        newEntities,
        newRelationships,
        logs: [`Completed IP Infrastructure Machine on ${ip}`],
      };
    },
  },

  {
    id: 'machine_identity_pivot',
    name: 'Identity Deep-Dive (Machine)',
    description: 'Pivots from an Account, Person, or Email across known social networks, developer profiles, and domain structures.',
    category: 'Machines',
    entityTypes: ['account', 'email', 'person'],
    iconName: 'Fingerprint',
    isMachine: true,
    run: async (entity, context) => {
      const name = entity.name.trim();
      context.log(`[Machine] Starting Identity Reconnaissance on "${name}" (${entity.type})...`);

      const newEntities: DiscoveredEntity[] = [];
      const newRelationships: DiscoveredRelationship[] = [];

      let username = name;

      // If email, extract username and domain first
      if (entity.type === 'email' && name.includes('@')) {
        const [userPart, domainPart] = name.split('@');
        username = userPart;
        const domain = cleanDomainName(domainPart);
        if (domain) {
          newEntities.push({
            name: domain,
            type: 'domain',
            attributes: { extracted_from_email: name },
            tags: ['email_domain'],
          });
          newRelationships.push({
            targetEntityName: domain,
            type: 'domain_of',
            directed: true,
            status: 'confirmed',
            confidence: 1.0,
            evidence: [`Email domain extracted from ${name}`],
          });
          context.log(`  -> Extracted Domain: ${domain}`);
        }

        // Gravatar check
        try {
          const hash = await sha256Hex(name.trim().toLowerCase());
          const gravatarUrl = `https://en.gravatar.com/${hash}.json`;
          const gravResp = await requestHttp<any>(gravatarUrl);
          if (gravResp.data?.entry && gravResp.data.entry.length > 0) {
            const entry = gravResp.data.entry[0];
            const displayName = entry.displayName || entry.preferredUsername;
            if (displayName) {
              newEntities.push({
                name: displayName,
                type: 'person',
                attributes: {
                  gravatar_profile: entry.profileUrl,
                  about: entry.aboutMe,
                  location: entry.currentLocation,
                },
                photo: entry.thumbnailUrl,
                tags: ['gravatar'],
              });
              newRelationships.push({
                targetEntityName: displayName,
                type: 'profile_of',
                directed: true,
                status: 'confirmed',
                confidence: 0.95,
                evidence: [`Verified Gravatar profile: ${entry.profileUrl}`],
              });
              context.log(`  -> Found Gravatar Profile: "${displayName}"`);
            }
          }
        } catch {
          // No public gravatar profile
        }
      }

      // Check GitHub public profile
      const cleanUser = username.replace(/[^a-zA-Z0-9_\-\.]/g, '');
      if (cleanUser.length >= 2) {
        context.log(`  -> Querying GitHub OSINT for user "${cleanUser}"...`);
        try {
          const ghResp = await requestHttp<any>(`https://api.github.com/users/${encodeURIComponent(cleanUser)}`, {
            headers: { 'User-Agent': 'Trace-OSINT-App' },
          });
          if (ghResp.ok && ghResp.data?.login) {
            const d = ghResp.data;
            context.log(`  -> Found GitHub Account: @${d.login} (${d.name || 'No full name'})`);

            newEntities.push({
              name: `GitHub: @${d.login}`,
              type: 'account',
              attributes: {
                platform: 'github',
                username: d.login,
                profile_url: d.html_url,
                bio: d.bio,
                public_repos: d.public_repos,
                followers: d.followers,
                created_at: d.created_at,
              },
              photo: d.avatar_url,
              tags: ['github', 'developer'],
            });
            newRelationships.push({
              targetEntityName: `GitHub: @${d.login}`,
              type: 'verified_profile',
              directed: true,
              status: 'confirmed',
              confidence: 1.0,
              evidence: [`GitHub API confirmed: ${d.html_url}`],
            });

            if (d.name) {
              newEntities.push({
                name: d.name,
                type: 'person',
                attributes: { github_username: d.login },
                photo: d.avatar_url,
                tags: ['person', 'developer'],
              });
              newRelationships.push({
                targetEntityName: d.name,
                type: 'identity_of',
                directed: true,
                status: 'supported',
                confidence: 0.9,
                evidence: [`GitHub account name declaration`],
              });
            }

            if (d.company) {
              const compName = d.company.replace(/^@/, '').trim();
              newEntities.push({
                name: compName,
                type: 'company',
                attributes: { employee_handle: d.login },
                tags: ['organization'],
              });
              newRelationships.push({
                targetEntityName: compName,
                type: 'works_at',
                directed: true,
                status: 'supported',
                confidence: 0.85,
                evidence: [`Declared employer in GitHub bio`],
              });
            }

            if (d.location) {
              newEntities.push({
                name: d.location,
                type: 'location',
                attributes: {},
                tags: ['location'],
              });
              newRelationships.push({
                targetEntityName: d.location,
                type: 'located_in',
                directed: true,
                status: 'supported',
                confidence: 0.8,
                evidence: [`Profile location field`],
              });
            }
          }
        } catch (err: any) {
          context.log(`  [Notice] GitHub user check: ${err.message}`);
        }

        // Telegram candidate pivot
        newEntities.push({
          name: `Telegram: @${cleanUser}`,
          type: 'account',
          attributes: { platform: 'telegram', handle: cleanUser, url: `https://t.me/${cleanUser}` },
          tags: ['telegram', 'candidate'],
        });
        newRelationships.push({
          targetEntityName: `Telegram: @${cleanUser}`,
          type: 'same_handle_candidate',
          directed: true,
          status: 'candidate',
          confidence: 0.6,
          evidence: [`Handle matching "${cleanUser}" on Telegram`],
        });
      }

      return {
        newEntities,
        newRelationships,
        logs: [`Completed Identity Deep-Dive on ${name}`],
      };
    },
  },

  // ==========================================
  // DNS & INFRASTRUCTURE TRANSFORMS
  // ==========================================
  {
    id: 'dns_resolve_ip',
    name: 'DNS: Resolve to IP (A & AAAA Records)',
    description: 'Queries Cloudflare and Google DNS-over-HTTPS to discover all IPv4 and IPv6 addresses mapped to this domain.',
    category: 'DNS & Infrastructure',
    entityTypes: ['domain'],
    iconName: 'Network',
    run: async (entity, context) => {
      const domain = cleanDomainName(entity.name);
      context.log(`Running DNS Resolve on "${domain}"...`);

      const newEntities: DiscoveredEntity[] = [];
      const newRelationships: DiscoveredRelationship[] = [];

      try {
        const dohResp = await requestHttp<any>(
          `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=A`,
          { headers: { Accept: 'application/dns-json' } }
        );
        const answers = dohResp.data?.Answer || [];
        const aRecords = answers
          .filter((a: any) => a.type === 1 && a.data)
          .map((a: any) => a.data.trim());

        // Also query AAAA
        try {
          const aaaaResp = await requestHttp<any>(
            `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=AAAA`,
            { headers: { Accept: 'application/dns-json' } }
          );
          const aaaaAnswers = aaaaResp.data?.Answer || [];
          for (const a of aaaaAnswers) {
            if (a.type === 28 && a.data) {
              aRecords.push(a.data.trim());
            }
          }
        } catch {}

        for (const ip of aRecords) {
          newEntities.push({
            name: ip,
            type: 'ip',
            attributes: { source_domain: domain, resolved_via: 'DoH A/AAAA' },
            tags: ['dns', 'ip'],
          });
          newRelationships.push({
            targetEntityName: ip,
            type: 'resolves_to',
            directed: true,
            status: 'confirmed',
            confidence: 1.0,
            evidence: [`DNS A/AAAA record: ${domain} -> ${ip}`],
          });
          context.log(`  -> Discovered IP: ${ip}`);
        }

        if (newEntities.length === 0) {
          context.log(`  No A or AAAA records returned for "${domain}".`);
        }
      } catch (err: any) {
        throw new Error(`DNS resolve failed: ${err.message}`);
      }

      return {
        newEntities,
        newRelationships,
        logs: [`Resolved ${newEntities.length} IP(s) for ${domain}`],
      };
    },
  },

  {
    id: 'dns_find_mx',
    name: 'DNS: Find Mail Servers (MX Records)',
    description: 'Identifies the mail exchange (MX) servers handling incoming email for this domain.',
    category: 'DNS & Infrastructure',
    entityTypes: ['domain'],
    iconName: 'Mail',
    run: async (entity, context) => {
      const domain = cleanDomainName(entity.name);
      context.log(`Querying MX records for "${domain}"...`);

      const newEntities: DiscoveredEntity[] = [];
      const newRelationships: DiscoveredRelationship[] = [];

      const mxResp = await requestHttp<any>(
        `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=MX`,
        { headers: { Accept: 'application/dns-json' } }
      );

      const answers = mxResp.data?.Answer || [];
      for (const ans of answers) {
        if (ans.type === 15 && ans.data) {
          const parts = ans.data.trim().split(/\s+/);
          const priority = parts[0];
          const mxHost = cleanDomainName(parts[parts.length - 1]);
          if (mxHost) {
            newEntities.push({
              name: mxHost,
              type: 'domain',
              attributes: { role: 'Mail Exchange (MX)', priority },
              tags: ['mx', 'mail_server'],
            });
            newRelationships.push({
              targetEntityName: mxHost,
              type: 'mail_server',
              directed: true,
              status: 'confirmed',
              confidence: 1.0,
              evidence: [`DNS MX Record on ${domain} (priority ${priority})`],
            });
            context.log(`  -> Found MX Server: ${mxHost} (Priority: ${priority})`);
          }
        }
      }

      return { newEntities, newRelationships, logs: [`Found ${newEntities.length} MX server(s)`] };
    },
  },

  {
    id: 'dns_find_ns',
    name: 'DNS: Find Name Servers (NS Records)',
    description: 'Discovers the authoritative name servers that manage DNS delegation for this domain.',
    category: 'DNS & Infrastructure',
    entityTypes: ['domain'],
    iconName: 'Layers',
    run: async (entity, context) => {
      const domain = cleanDomainName(entity.name);
      context.log(`Querying NS records for "${domain}"...`);

      const newEntities: DiscoveredEntity[] = [];
      const newRelationships: DiscoveredRelationship[] = [];

      const nsResp = await requestHttp<any>(
        `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=NS`,
        { headers: { Accept: 'application/dns-json' } }
      );

      const answers = nsResp.data?.Answer || [];
      for (const ans of answers) {
        if (ans.type === 2 && ans.data) {
          const nsHost = cleanDomainName(ans.data);
          if (nsHost) {
            newEntities.push({
              name: nsHost,
              type: 'domain',
              attributes: { role: 'Authoritative Nameserver (NS)' },
              tags: ['nameserver', 'dns'],
            });
            newRelationships.push({
              targetEntityName: nsHost,
              type: 'nameserver',
              directed: true,
              status: 'confirmed',
              confidence: 1.0,
              evidence: [`DNS NS record for ${domain}`],
            });
            context.log(`  -> Nameserver: ${nsHost}`);
          }
        }
      }

      return { newEntities, newRelationships, logs: [`Found ${newEntities.length} Nameserver(s)`] };
    },
  },

  {
    id: 'dns_subdomains_scan',
    name: 'DNS: Enumerate Common Subdomains',
    description: 'Probes common subdomains (www, mail, api, dev, vpn, portal, app, auth, stage, admin, test) to uncover hidden attack surface.',
    category: 'DNS & Infrastructure',
    entityTypes: ['domain'],
    iconName: 'Globe',
    run: async (entity, context) => {
      const domain = cleanDomainName(entity.name);
      context.log(`Scanning active subdomains for "${domain}"...`);

      const newEntities: DiscoveredEntity[] = [];
      const newRelationships: DiscoveredRelationship[] = [];

      const wordlist = [
        'www',
        'mail',
        'api',
        'dev',
        'vpn',
        'admin',
        'portal',
        'app',
        'auth',
        'blog',
        'stage',
        'test',
        'cdn',
        'cloud',
        'docs',
        'login',
      ];

      for (const prefix of wordlist) {
        const candidate = `${prefix}.${domain}`;
        try {
          const resp = await requestHttp<any>(
            `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(candidate)}&type=A`,
            { headers: { Accept: 'application/dns-json' }, timeoutMs: 3000 }
          );
          if (resp.data?.Answer && resp.data.Answer.length > 0) {
            newEntities.push({
              name: candidate,
              type: 'domain',
              attributes: { parent_domain: domain, prefix },
              tags: ['subdomain'],
            });
            newRelationships.push({
              targetEntityName: candidate,
              type: 'subdomain_of',
              directed: true,
              status: 'confirmed',
              confidence: 0.95,
              evidence: [`DNS A record discovered on ${candidate}`],
            });
            context.log(`  -> Found active subdomain: ${candidate}`);
          }
        } catch {
          // ignore missed candidate
        }
      }

      return {
        newEntities,
        newRelationships,
        logs: [`Discovered ${newEntities.length} active subdomain(s) for ${domain}`],
      };
    },
  },

  {
    id: 'whois_rdap_lookup',
    name: 'WHOIS / RDAP: Registrar & Contacts',
    description: 'Queries public ICANN RDAP servers to extract registrar organization, registration dates, and abuse contact emails.',
    category: 'DNS & Infrastructure',
    entityTypes: ['domain'],
    iconName: 'Shield',
    run: async (entity, context) => {
      const domain = cleanDomainName(entity.name);
      context.log(`Querying RDAP/WHOIS for "${domain}"...`);

      const newEntities: DiscoveredEntity[] = [];
      const newRelationships: DiscoveredRelationship[] = [];

      try {
        const rdapResp = await requestHttp<any>(`https://rdap.org/domain/${encodeURIComponent(domain)}`);
        if (rdapResp.data && rdapResp.data.ldhName) {
          const d = rdapResp.data;
          context.log(`  -> Received RDAP record for ${d.ldhName}`);

          // Extract Registrar entity
          if (Array.isArray(d.entities)) {
            for (const ent of d.entities) {
              const roles = ent.roles || [];
              if (roles.includes('registrar')) {
                let registrarName = ent.handle || '';
                if (Array.isArray(ent.vcardArray?.[1])) {
                  const fnItem = ent.vcardArray[1].find((item: any) => item[0] === 'fn');
                  if (fnItem && fnItem[3]) registrarName = fnItem[3];
                }
                if (registrarName) {
                  newEntities.push({
                    name: registrarName,
                    type: 'company',
                    attributes: { role: 'Domain Registrar', iana_id: ent.publicIds?.[0]?.identifier },
                    tags: ['registrar', 'whois'],
                  });
                  newRelationships.push({
                    targetEntityName: registrarName,
                    type: 'registered_with',
                    directed: true,
                    status: 'confirmed',
                    confidence: 1.0,
                    evidence: [`ICANN RDAP database registrar record`],
                  });
                  context.log(`  -> Registrar: ${registrarName}`);
                }
              }

              // Extract abuse contact email
              if (roles.includes('abuse') && Array.isArray(ent.vcardArray?.[1])) {
                const emailItem = ent.vcardArray[1].find((item: any) => item[0] === 'email');
                if (emailItem && emailItem[3]) {
                  const abuseEmail = emailItem[3].trim();
                  newEntities.push({
                    name: abuseEmail,
                    type: 'email',
                    attributes: { role: 'Abuse Contact Email' },
                    tags: ['abuse_contact', 'whois'],
                  });
                  newRelationships.push({
                    targetEntityName: abuseEmail,
                    type: 'abuse_contact',
                    directed: true,
                    status: 'confirmed',
                    confidence: 0.95,
                    evidence: [`RDAP abuse contact vcard entry`],
                  });
                  context.log(`  -> Abuse Email: ${abuseEmail}`);
                }
              }
            }
          }
        }
      } catch (err: any) {
        throw new Error(`RDAP lookup failed: ${err.message}`);
      }

      return {
        newEntities,
        newRelationships,
        logs: [`Completed RDAP lookup for ${domain}`],
      };
    },
  },

  // ==========================================
  // NETWORK & IP TRANSFORMS
  // ==========================================
  {
    id: 'ip_geolocation_asn',
    name: 'IP: Geolocation & ASN Lookup',
    description: 'Maps the IP to physical real-world location (City, Region, Country) and identifies the Autonomous System Number (ASN) and hosting ISP.',
    category: 'Network & IP',
    entityTypes: ['ip'],
    iconName: 'MapPin',
    run: async (entity, context) => {
      const ip = entity.name.trim();
      context.log(`Querying IP Geolocation & ASN for "${ip}"...`);

      const newEntities: DiscoveredEntity[] = [];
      const newRelationships: DiscoveredRelationship[] = [];

      const geoResp = await requestHttp<any>(
        `http://ip-api.com/json/${ip}?fields=status,message,country,city,regionName,isp,org,as,lat,lon`
      );

      if (geoResp.data?.status === 'success') {
        const { country, city, regionName, isp, org, as: asn, lat, lon } = geoResp.data;
        const loc = [city, regionName, country].filter(Boolean).join(', ');
        if (loc) {
          newEntities.push({
            name: loc,
            type: 'location',
            attributes: { latitude: lat, longitude: lon, country, city, region: regionName },
            tags: ['geolocation'],
          });
          newRelationships.push({
            targetEntityName: loc,
            type: 'located_in',
            directed: true,
            status: 'confirmed',
            confidence: 0.95,
            evidence: [`IP-API geolocation database entry for ${ip}`],
          });
          context.log(`  -> Location: ${loc}`);
        }

        const orgName = isp || org || asn;
        if (orgName) {
          newEntities.push({
            name: orgName,
            type: 'organization',
            attributes: { isp, org, asn },
            tags: ['isp', 'network'],
          });
          newRelationships.push({
            targetEntityName: orgName,
            type: 'hosted_by',
            directed: true,
            status: 'confirmed',
            confidence: 0.95,
            evidence: [`BGP ASN route match for ${ip}`],
          });
          context.log(`  -> Network Provider: ${orgName}`);
        }
      } else {
        throw new Error(geoResp.data?.message || 'Failed to retrieve IP geolocation');
      }

      return { newEntities, newRelationships, logs: [`Geolocated IP ${ip}`] };
    },
  },

  {
    id: 'ip_reverse_dns',
    name: 'IP: Reverse DNS Lookup (PTR)',
    description: 'Queries reverse DNS (in-addr.arpa) to discover domain names mapped back to this IP address.',
    category: 'Network & IP',
    entityTypes: ['ip'],
    iconName: 'RotateCcw',
    run: async (entity, context) => {
      const ip = entity.name.trim();
      context.log(`Running Reverse DNS on "${ip}"...`);

      const newEntities: DiscoveredEntity[] = [];
      const newRelationships: DiscoveredRelationship[] = [];

      const octets = ip.split('.');
      if (octets.length !== 4) {
        throw new Error(`Invalid IPv4 address format: ${ip}`);
      }

      const ptrName = `${octets[3]}.${octets[2]}.${octets[1]}.${octets[0]}.in-addr.arpa`;
      const ptrResp = await requestHttp<any>(
        `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(ptrName)}&type=PTR`,
        { headers: { Accept: 'application/dns-json' } }
      );

      const answers = ptrResp.data?.Answer || [];
      for (const a of answers) {
        if (a.type === 12 && a.data) {
          const host = cleanDomainName(a.data);
          if (host) {
            newEntities.push({
              name: host,
              type: 'domain',
              attributes: { reverse_ip: ip },
              tags: ['reverse_dns'],
            });
            newRelationships.push({
              targetEntityName: host,
              type: 'resolves_from',
              directed: true,
              status: 'confirmed',
              confidence: 0.95,
              evidence: [`DNS PTR answer: ${ptrName} -> ${host}`],
            });
            context.log(`  -> PTR Domain: ${host}`);
          }
        }
      }

      return {
        newEntities,
        newRelationships,
        logs: [`Discovered ${newEntities.length} PTR hostname(s) for ${ip}`],
      };
    },
  },

  // ==========================================
  // OSINT & IDENTITY TRANSFORMS
  // ==========================================
  {
    id: 'email_to_domain_and_name',
    name: 'Email: To Domain & Name Heuristics',
    description: 'Extracts corporate email domain and parses patronymics or first/last names from standard email formats.',
    category: 'OSINT & Identity',
    entityTypes: ['email'],
    iconName: 'Mail',
    run: async (entity, context) => {
      const email = entity.name.trim().toLowerCase();
      context.log(`Parsing email identity from "${email}"...`);

      const newEntities: DiscoveredEntity[] = [];
      const newRelationships: DiscoveredRelationship[] = [];

      if (!email.includes('@')) {
        throw new Error(`Invalid email address: ${email}`);
      }

      const [userPart, domainPart] = email.split('@');
      const domain = cleanDomainName(domainPart);

      if (domain) {
        newEntities.push({
          name: domain,
          type: 'domain',
          attributes: { extracted_from_email: email },
          tags: ['email_domain'],
        });
        newRelationships.push({
          targetEntityName: domain,
          type: 'domain_of',
          directed: true,
          status: 'confirmed',
          confidence: 1.0,
          evidence: [`Direct domain extraction from ${email}`],
        });
        context.log(`  -> Extracted Domain: ${domain}`);
      }

      // Name heuristics: first.last or first_last
      const cleanUser = userPart.replace(/[0-9]/g, '');
      const parts = cleanUser.split(/[\._\-]/).filter((p) => p.length >= 2);
      if (parts.length >= 2) {
        const formattedName = parts
          .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
          .join(' ');

        newEntities.push({
          name: formattedName,
          type: 'person',
          attributes: { inferred_from_email: email },
          tags: ['person', 'heuristic'],
        });
        newRelationships.push({
          targetEntityName: formattedName,
          type: 'email_of',
          directed: true,
          status: 'supported',
          confidence: 0.8,
          evidence: [`Username format "${userPart}" matches personal name pattern`],
        });
        context.log(`  -> Inferred Person: "${formattedName}"`);
      }

      return {
        newEntities,
        newRelationships,
        logs: [`Completed email identity extraction for ${email}`],
      };
    },
  },

  {
    id: 'account_github_recon',
    name: 'Account: GitHub Profile Recon',
    description: 'Queries public GitHub APIs to extract real name, declared employer, location, personal blog, and public avatar.',
    category: 'OSINT & Identity',
    entityTypes: ['account'],
    iconName: 'Fingerprint',
    run: async (entity, context) => {
      const username = entity.name.replace(/^@/, '').trim();
      context.log(`Querying GitHub API for account "${username}"...`);

      const newEntities: DiscoveredEntity[] = [];
      const newRelationships: DiscoveredRelationship[] = [];

      const resp = await requestHttp<any>(`https://api.github.com/users/${encodeURIComponent(username)}`, {
        headers: { 'User-Agent': 'Trace-OSINT-App' },
      });

      if (!resp.ok || !resp.data?.login) {
        throw new Error(`GitHub user "${username}" not found or API rate limited.`);
      }

      const d = resp.data;
      context.log(`  -> Confirmed GitHub profile: ${d.html_url}`);

      if (d.name) {
        newEntities.push({
          name: d.name,
          type: 'person',
          attributes: { github_login: d.login },
          photo: d.avatar_url,
          tags: ['person', 'developer'],
        });
        newRelationships.push({
          targetEntityName: d.name,
          type: 'identity_of',
          directed: true,
          status: 'confirmed',
          confidence: 0.95,
          evidence: [`GitHub profile declared name: ${d.name}`],
        });
        context.log(`  -> Real Name: "${d.name}"`);
      }

      if (d.company) {
        const companyName = d.company.replace(/^@/, '').trim();
        newEntities.push({
          name: companyName,
          type: 'company',
          attributes: { employee: d.login },
          tags: ['organization'],
        });
        newRelationships.push({
          targetEntityName: companyName,
          type: 'works_at',
          directed: true,
          status: 'supported',
          confidence: 0.9,
          evidence: [`Declared company on GitHub: ${d.company}`],
        });
        context.log(`  -> Company: "${companyName}"`);
      }

      if (d.location) {
        newEntities.push({
          name: d.location,
          type: 'location',
          attributes: {},
          tags: ['location'],
        });
        newRelationships.push({
          targetEntityName: d.location,
          type: 'located_in',
          directed: true,
          status: 'supported',
          confidence: 0.85,
          evidence: [`Profile location field`],
        });
        context.log(`  -> Location: "${d.location}"`);
      }

      if (d.blog) {
        const blogUrl = d.blog.startsWith('http') ? d.blog : `https://${d.blog}`;
        const domain = cleanDomainName(blogUrl);
        if (domain) {
          newEntities.push({
            name: domain,
            type: 'website',
            attributes: { url: blogUrl },
            tags: ['website', 'personal_blog'],
          });
          newRelationships.push({
            targetEntityName: domain,
            type: 'owns_website',
            directed: true,
            status: 'confirmed',
            confidence: 0.9,
            evidence: [`Listed blog on GitHub: ${blogUrl}`],
          });
          context.log(`  -> Website: ${domain}`);
        }
      }

      return {
        newEntities,
        newRelationships,
        logs: [`Completed GitHub Recon on ${username}`],
      };
    },
  },

  {
    id: 'account_social_pivots',
    name: 'Account: Pivot Across Social Platforms',
    description: 'Generates candidate accounts on major platforms (Telegram, Twitter/X, Reddit, Keybase, HackerNews) sharing the same username.',
    category: 'OSINT & Identity',
    entityTypes: ['account', 'person'],
    iconName: 'Share2',
    run: async (entity, context) => {
      const handle = entity.name.replace(/^@/, '').replace(/\s+/g, '').toLowerCase();
      context.log(`Generating social platform pivots for "${handle}"...`);

      const newEntities: DiscoveredEntity[] = [];
      const newRelationships: DiscoveredRelationship[] = [];

      const platforms = [
        { name: 'Telegram', prefix: 'https://t.me/' },
        { name: 'GitHub', prefix: 'https://github.com/' },
        { name: 'Twitter/X', prefix: 'https://x.com/' },
        { name: 'Reddit', prefix: 'https://reddit.com/user/' },
        { name: 'Keybase', prefix: 'https://keybase.io/' },
      ];

      for (const p of platforms) {
        const accountLabel = `${p.name}: @${handle}`;
        newEntities.push({
          name: accountLabel,
          type: 'account',
          attributes: { platform: p.name.toLowerCase(), username: handle, profile_url: `${p.prefix}${handle}` },
          tags: ['social', p.name.toLowerCase(), 'candidate'],
        });
        newRelationships.push({
          targetEntityName: accountLabel,
          type: 'same_handle_candidate',
          directed: true,
          status: 'candidate',
          confidence: 0.6,
          evidence: [`Username "${handle}" candidate on ${p.name}`],
        });
      }

      context.log(`  -> Created ${platforms.length} social candidate pivots.`);

      return {
        newEntities,
        newRelationships,
        logs: [`Generated ${platforms.length} social platform candidate links`],
      };
    },
  },

  // ==========================================
  // WEB & CONTENT TRANSFORMS
  // ==========================================
  {
    id: 'website_extract_domain',
    name: 'Website: Extract Root Domain',
    description: 'Extracts canonical domain and protocol structure from a website URL.',
    category: 'Web & Content',
    entityTypes: ['website'],
    iconName: 'Globe2',
    run: async (entity, context) => {
      const raw = entity.name.trim();
      const domain = cleanDomainName(raw);

      if (!domain) {
        throw new Error(`Unable to extract clean domain from website: ${raw}`);
      }

      const newEntities: DiscoveredEntity[] = [
        {
          name: domain,
          type: 'domain',
          attributes: { source_website: raw },
          tags: ['domain'],
        },
      ];

      const newRelationships: DiscoveredRelationship[] = [
        {
          targetEntityName: domain,
          type: 'domain_for',
          directed: true,
          status: 'confirmed',
          confidence: 1.0,
          evidence: [`Extracted root domain from URL: ${raw}`],
        },
      ];

      return {
        newEntities,
        newRelationships,
        logs: [`Extracted domain ${domain} from website ${raw}`],
      };
    },
  },
];

/**
 * Find transforms applicable to an entity type
 */
export function getTransformsForEntity(entityType: EntityType): TransformDefinition[] {
  return TRANSFORMS_REGISTRY.filter((t) => t.entityTypes.includes(entityType));
}

/**
 * Find a transform by its ID
 */
export function getTransformById(id: string): TransformDefinition | undefined {
  return TRANSFORMS_REGISTRY.find((t) => t.id === id);
}
