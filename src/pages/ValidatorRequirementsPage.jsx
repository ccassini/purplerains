import { ArrowDown, ArrowRight, ArrowUpRight, Cpu, HardDrive, MemoryStick, Network, Server } from 'lucide-react'
import { Link } from 'react-router-dom'
import './ValidatorRequirementsPage.css'

const CHECKED_DATE = '2026-09-24'
const DOCS = {
  hardware: 'https://docs.monad.xyz/node-ops/hardware-requirements',
  setup: 'https://docs.monad.xyz/node-ops/full-node-installation',
  validator: 'https://docs.monad.xyz/node-ops/validator-installation',
  upgrades: 'https://docs.monad.xyz/node-ops/upgrade-instructions',
  operations: 'https://docs.monad.xyz/node-ops/general-operations',
}

const requirements = [
  { number: '01', label: 'Processor', icon: Cpu, value: '16 cores', detail: '4.5 GHz+ base clock', note: 'Official examples: Ryzen 9950X, Ryzen 7950X and EPYC 4584PX.' },
  { number: '02', label: 'Memory', icon: MemoryStick, value: '32 GB+', detail: 'RAM', note: 'The published memory requirement applies to validators and full nodes.' },
  { number: '03', label: 'Storage', icon: HardDrive, value: '2 TB + 500 GB', detail: 'Two separate disks', note: 'Dedicated TrieDB disk plus MonadBFT / OS disk. Both PCIe Gen4×4 NVMe SSD or better.' },
  { number: '04', label: 'Bandwidth', icon: Network, value: '300 Mbit/s', detail: 'Validator requirement', note: 'Full nodes require 100 Mbit/s. Bandwidth is the only published hardware difference.' },
]

const resources = [
  { number: '01', title: 'Hardware requirements', label: 'Choose the machine', href: DOCS.hardware },
  { number: '02', title: 'Full node installation', label: 'Prepare and sync', href: DOCS.setup },
  { number: '03', title: 'Validator installation', label: 'Register your validator', href: DOCS.validator },
  { number: '04', title: 'Upgrade instructions', label: 'Keep the client current', href: DOCS.upgrades },
]

function SourceLink({ href, label = 'Official docs', context }) {
  return (
    <a className="vh-source" href={href} target="_blank" rel="noopener noreferrer" aria-label={`${context || label} — official Monad documentation (opens in a new tab)`}>
      {label}<ArrowUpRight size={13} aria-hidden="true" />
    </a>
  )
}

export default function ValidatorRequirementsPage() {
  return (
    <div className="vh-page">
      <div className="vh-document">
        <nav className="vh-nav" aria-label="Staking tools">
          <Link to="/staking">Staking</Link>
          <Link to="/staking#calculator">Calculator</Link>
          <Link to="/validator-requirements" aria-current="page">Validator hardware</Link>
        </nav>
        <header className="vh-header">
          <div className="vh-heading">
            <div className="vh-eyebrow"><Server size={14} aria-hidden="true" /> Monad / Node operations</div>
            <h1>Validator hardware<span aria-hidden="true">.</span></h1>
            <p>Plan the machine. Prepare the node. Understand the requirements.</p>
          </div>
        </header>

        <div className="vh-reference-bar">
          <span className="vh-reference-origin"><span aria-hidden="true" /> Official Monad documentation</span>
          <span>Reviewed <time dateTime={CHECKED_DATE}>24 Sep 2026</time></span>
        </div>

        <nav className="vh-index" aria-label="On this page">
          <a href="#vh-requirements"><span>01</span> Requirements</a>
          <a href="#vh-storage"><span>02</span> Disk layout</a>
          <a href="#vh-operations"><span>03</span> Node setup</a>
          <a href="#vh-eligibility"><span>04</span> Eligibility</a>
          <a href="#vh-guides" className="vh-index-guide">Installation guides <ArrowDown size={13} aria-hidden="true" /></a>
        </nav>

        <section className="vh-section" id="vh-requirements" aria-labelledby="vh-requirements-title">
          <div className="vh-section-heading">
            <div><span className="vh-kicker">01 / Hardware baseline</span><h2 id="vh-requirements-title">Built for bare metal.</h2></div>
            <SourceLink href={DOCS.hardware} label="Hardware specification" />
          </div>
          <div className="vh-bare-metal">
            <Server size={18} aria-hidden="true" />
            <p>A dedicated bare-metal server is required. Virtualized cloud environments are not officially supported.</p>
          </div>

          <table className="vh-matrix">
            <caption className="vh-visually-hidden">Official hardware requirements for a Monad validator</caption>
            <thead><tr><th scope="col">Component</th><th scope="col">Requirement</th><th scope="col">Details</th><th scope="col"><span className="vh-visually-hidden">Source</span></th></tr></thead>
            <tbody>
              {requirements.map(({ number, label, icon: Icon, value, detail, note }) => (
                <tr key={label}>
                  <th scope="row"><span className="vh-component"><span className="vh-row-number">{number}</span><Icon size={18} aria-hidden="true" />{label}</span></th>
                  <td className="vh-spec"><strong>{value}</strong><span>{detail}</span></td>
                  <td className="vh-spec-note">{note}</td>
                  <td className="vh-spec-source"><SourceLink href={`${DOCS.hardware}#requirements`} label="Source" context={`${label} requirements`} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="vh-caption">Hardware compliance and validator selection are separate. <a href="#vh-eligibility">See stake and active-set criteria <ArrowRight size={12} aria-hidden="true" /></a></p>
        </section>

        <div className="vh-technical-grid">
          <section className="vh-section vh-storage" id="vh-storage" aria-labelledby="vh-storage-title">
            <div className="vh-section-heading"><div><span className="vh-kicker">02 / Storage architecture</span><h2 id="vh-storage-title">Two drives. Separate roles.</h2></div></div>
            <figure className="vh-drive-diagram">
              <div className="vh-drive-interface"><span>PCIe Gen4×4 NVMe or better</span><span className="vh-diagram-key">Schematic</span></div>
              <div className="vh-drives">
                <div className="vh-drive vh-drive-triedb">
                  <div className="vh-drive-label"><span>DRIVE 01</span><span className="vh-drive-tag">Dedicated</span></div>
                  <strong className="vh-drive-size">2<span>TB</span></strong>
                  <h3>TrieDB</h3><p>Execution state</p>
                  <div className="vh-drive-chips" aria-hidden="true"><i /><i /><i /><i /></div>
                  <span className="vh-drive-device">/dev/triedb</span>
                </div>
                <div className="vh-drive vh-drive-system">
                  <div className="vh-drive-label"><span>DRIVE 02</span></div>
                  <strong className="vh-drive-size">500<span>GB</span></strong>
                  <h3>MonadBFT + OS</h3><p>Consensus &amp; system</p>
                  <div className="vh-drive-chips" aria-hidden="true"><i /><i /></div>
                  <span className="vh-drive-device">Separate system disk</span>
                </div>
              </div>
              <figcaption>TrieDB uses a dedicated device with no mounted filesystem or RAID. Configure 512-byte LBA before initialization.</figcaption>
            </figure>
            <div className="vh-section-sources"><SourceLink href={`${DOCS.hardware}#requirements`} label="Disk requirements" /><SourceLink href={`${DOCS.setup}#configure-triedb-device`} label="TrieDB setup" /></div>
          </section>

          <section className="vh-section vh-operations" id="vh-operations" aria-labelledby="vh-operations-title">
            <div className="vh-section-heading"><div><span className="vh-kicker">03 / Operational setup</span><h2 id="vh-operations-title">Prepare the environment.</h2></div></div>
            <ol className="vh-operations-list">
              <li><span className="vh-op-number">01</span><div><h3>Ubuntu 24.04+</h3><p>Use the operating system specified in the installation prerequisites.</p><SourceLink href={`${DOCS.setup}#prerequisites`} label="Prerequisites" /></div></li>
              <li><span className="vh-op-number">02</span><div><h3>Disable HT / SMT</h3><p>Turn off HyperThreading or Simultaneous MultiThreading in BIOS.</p><SourceLink href={`${DOCS.setup}#prerequisites`} label="CPU configuration" /></div></li>
              <li><span className="vh-op-number">03</span><div><h3>Configure network access</h3><p>The guide specifies SSH and port <code>8000 TCP/UDP</code>. Its firewall example also permits <code>8001</code> and <code>8002</code>; follow the current Mainnet configuration.</p><SourceLink href={`${DOCS.setup}#configure-firewall-rules`} label="Firewall rules" /></div></li>
              <li><span className="vh-op-number">04</span><div><h3>Keep the node healthy</h3><p>Monitor service status and sync progress. Follow network-specific release instructions.</p><div className="vh-op-sources"><SourceLink href={DOCS.operations} label="Operations" /><SourceLink href={DOCS.upgrades} label="Upgrades" /></div></div></li>
            </ol>
          </section>
        </div>

        <section className="vh-eligibility" id="vh-eligibility" aria-labelledby="vh-eligibility-title">
          <div className="vh-eligibility-intro"><span className="vh-kicker">04 / Validator eligibility</span><h2 id="vh-eligibility-title">The machine is one part.<br />Stake is the next.</h2><p>Sync a working node before registration. Becoming an active validator also requires all three conditions below.</p><SourceLink href={DOCS.validator} label="Registration & eligibility" /></div>
          <div className="vh-eligibility-metrics">
            <div><span className="vh-metric-label">Minimum self-stake</span><strong>100,000 <span>MON</span></strong><p>Required to register and maintained afterward.</p></div>
            <div><span className="vh-metric-label">Minimum total stake</span><strong>10,000,000 <span>MON</span></strong><p>Self-stake and delegated stake combined.</p></div>
            <div><span className="vh-metric-label">Active validator set</span><strong>Top 200</strong><p>Ranked by stake weight.</p></div>
          </div>
        </section>

        <section className="vh-section vh-guides" id="vh-guides" aria-labelledby="vh-guides-title">
          <div className="vh-section-heading"><div><span className="vh-kicker">Continue with the source</span><h2 id="vh-guides-title">From specification to setup.</h2></div><span className="vh-docs-domain">docs.monad.xyz <ArrowUpRight size={14} aria-hidden="true" /></span></div>
          <div className="vh-resource-list">
            {resources.map(({ number, title, label, href }) => <a className="vh-resource" key={number} href={href} target="_blank" rel="noopener noreferrer"><span className="vh-resource-number">{number}</span><div><span>{label}</span><h3>{title}</h3></div><ArrowUpRight size={18} aria-hidden="true" /><span className="vh-visually-hidden"> (opens in a new tab)</span></a>)}
          </div>
          <footer className="vh-footer"><span>Reference snapshot · <time dateTime={CHECKED_DATE}>24 September 2026</time></span><p>Review the official documentation before provisioning or changing a node.</p></footer>
        </section>
      </div>
    </div>
  )
}
