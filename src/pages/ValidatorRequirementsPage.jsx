import React, { useState } from 'react'
import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { Server, Cpu, HardDrive, MemoryStick, Network, CheckCircle, AlertCircle, ExternalLink, Terminal, Copy, Download } from 'lucide-react'
import './ValidatorRequirementsPage.css'

export default function ValidatorRequirementsPage() {
  const [activeTab, setActiveTab] = useState('hardware')
  const [copiedScript, setCopiedScript] = useState(false)

  // Build installation script with proper escaping
  const installationScript = (() => {
    const dollar = '$'
    return `#!/bin/bash
# Monad Validator Node Installation Script
# Based on official Monad documentation
# https://docs.monad.xyz/node-ops/validator-installation

set -e

echo "🚀 Starting Monad Validator Node Installation..."
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
  echo "❌ Please run as root (use sudo)"
  exit 1
fi

# Step 1: Update system
echo "📦 Updating system packages..."
apt update
apt upgrade -y

# Install dependencies
echo "📦 Installing dependencies..."
apt install -y curl nvme-cli aria2 jq

# Step 2: Configure APT repository
echo "📦 Configuring Monad APT repository..."
cat <<EOF > /etc/apt/sources.list.d/category-labs.sources
Types: deb
URIs: https://pkg.category.xyz/
Suites: noble
Components: main
Signed-By: /etc/apt/keyrings/category-labs.gpg
EOF

curl -fsSL https://pkg.category.xyz/keys/public-key.asc \\
| gpg --dearmor --yes -o /etc/apt/keyrings/category-labs.gpg

# Step 3: Install monad package
echo "📦 Installing monad package..."
apt update
apt install -y monad=0.12.7
apt-mark hold monad

# Step 4: Create monad user
echo "👤 Creating monad user..."
if ! id "monad" &>/dev/null; then
  useradd -m -s /bin/bash monad
fi

# Create directories
echo "📁 Creating configuration directories..."
mkdir -p /home/monad/monad-bft/config \\
/home/monad/monad-bft/ledger \\
/home/monad/monad-bft/config/forkpoint \\
/home/monad/monad-bft/config/validators

# Step 5: Configure TrieDB Device
echo "💾 Configuring TrieDB Device..."
echo ""
echo "⚠️  IMPORTANT: Identify your NVMe drive for TrieDB"
echo "Available drives:"
nvme list
lsblk -o NAME,SIZE,TYPE,MOUNTPOINT,MODEL
echo ""
read -p "Enter NVMe drive path (e.g., /dev/nvme1n1): " TRIEDB_DRIVE

if [ ! -b "$TRIEDB_DRIVE" ]; then
  echo "❌ Invalid drive: $TRIEDB_DRIVE"
  exit 1
fi

echo "📝 Creating partition table on $TRIEDB_DRIVE..."
parted $TRIEDB_DRIVE mklabel gpt
parted $TRIEDB_DRIVE mkpart triedb 0% 100%

# Create udev rule
PARTUUID=$(lsblk -o PARTUUID $TRIEDB_DRIVE | tail -n 1)
echo "ENV{ID_PART_ENTRY_UUID}==\\"$PARTUUID\\", MODE=\\"0666\\", SYMLINK+=\\"triedb\\"" \\
| tee /etc/udev/rules.d/99-triedb.rules

udevadm trigger
udevadm control --reload
udevadm settle

# Verify LBA configuration
echo "🔍 Verifying LBA configuration..."
LBA_CHECK=$(nvme id-ns -H $TRIEDB_DRIVE | grep 'LBA Format' | grep 'in use' | grep '512 bytes')
if [ -z "$LBA_CHECK" ]; then
  echo "⚠️  512 byte LBA not enabled. Formatting..."
  nvme format --lbaf=0 $TRIEDB_DRIVE
  sleep 5
fi

# Format TrieDB partition
echo "💾 Formatting TrieDB partition..."
systemctl start monad-mpt
sleep 3
journalctl -u monad-mpt -n 20 -o cat

# Step 6: Configure Firewall
echo "🔥 Configuring firewall..."
ufw allow ssh
ufw allow 8000
ufw --force enable
iptables -I INPUT -p udp --dport 8000 -m length --length 0:1400 -j DROP

# Step 7: Configure OTEL Collector
echo "📊 Installing OTEL Collector..."
OTEL_VERSION="0.139.0"
OTEL_PACKAGE="https://github.com/open-telemetry/opentelemetry-collector-releases/releases/download/v${dollar}{OTEL_VERSION}/otelcol_${dollar}{OTEL_VERSION}_linux_amd64.deb"
curl -fsSL "$OTEL_PACKAGE" -o /tmp/otelcol_linux_amd64.deb
dpkg -i /tmp/otelcol_linux_amd64.deb || true
cp /opt/monad/scripts/otel-config.yaml /etc/otelcol/config.yaml
systemctl restart otelcol

# Step 8: Download configuration files
echo "📥 Downloading configuration files..."
MF_BUCKET=https://bucket.monadinfra.com
curl -o /home/monad/.env $MF_BUCKET/config/mainnet/latest/.env.example
curl -o /home/monad/monad-bft/config/node.toml $MF_BUCKET/config/mainnet/latest/node.toml

# Step 9: Generate keystore password (keep offline — never commit or paste into chat)
echo "🔐 Generating keystore password..."
sed -i "s|^KEYSTORE_PASSWORD=$|KEYSTORE_PASSWORD='$(openssl rand -base64 32)'|" /home/monad/.env
source /home/monad/.env
mkdir -p /opt/monad/backup/
# Print once to the terminal so you can store it in a password manager.
# Do NOT write the password to a plaintext file on disk.
echo ""
echo "⚠️  SAVE THIS PASSWORD OFFLINE (password manager / sealed backup)."
echo "   It will NOT be written to disk by this script."
echo "Keystore password: ${dollar}{KEYSTORE_PASSWORD}"
echo ""
read -r -p "Press Enter after you have saved the password securely..."

# Step 10: Generate keystores
echo "🔑 Generating keystores..."
source /home/monad/.env
if [ ! -f /home/monad/monad-bft/config/id-secp ] || [ ! -f /home/monad/monad-bft/config/id-bls ]; then
  monad-keystore create \\
    --key-type secp \\
    --keystore-path /home/monad/monad-bft/config/id-secp \\
    --password "${dollar}{KEYSTORE_PASSWORD}" >> /opt/monad/backup/secp-backup
  
  monad-keystore create \\
    --key-type bls \\
    --keystore-path /home/monad/monad-bft/config/id-bls \\
    --password "${dollar}{KEYSTORE_PASSWORD}" >> /opt/monad/backup/bls-backup
  
  grep "public key" /opt/monad/backup/secp-backup /opt/monad/backup/bls-backup \\
    | tee /home/monad/pubkey-secp-bls
  echo "✅ Keystores generated successfully"
else
  echo "⚠️  Keystores already exist, skipping..."
fi

# Step 11: Configure node signature record
echo "✍️  Generating node signature record..."
source /home/monad/.env
PUBLIC_IP=$(curl -s4 ifconfig.me)
monad-sign-name-record \\
  --address ${dollar}{PUBLIC_IP}:8000 \\
  --keystore-path /home/monad/monad-bft/config/id-secp \\
  --password "${dollar}{KEYSTORE_PASSWORD}" \\
  --self-record-seq-num 0 > /tmp/name-record.txt

echo ""
echo "📝 Please update /home/monad/monad-bft/config/node.toml with:"
echo "   - beneficiary address (your rewards address)"
echo "   - node_name (unique identifier)"
echo "   - self_address, self_record_seq_num, self_name_record_sig from /tmp/name-record.txt"
echo ""

# Step 12: Set permissions and enable services
echo "🔧 Setting permissions..."
chown -R monad:monad /home/monad/

echo "🚀 Enabling services..."
systemctl enable monad-bft monad-execution monad-rpc

echo ""
echo "✅ Installation complete!"
echo ""
echo "⚠️  IMPORTANT NEXT STEPS:"
echo "1. Edit /home/monad/monad-bft/config/node.toml:"
echo "   - Set beneficiary address"
echo "   - Set node_name"
echo "   - Update peer_discovery section with signature from /tmp/name-record.txt"
echo ""
echo "2. Backup these files to external location:"
echo "   - /opt/monad/backup/secp-backup"
echo "   - /opt/monad/backup/bls-backup"
echo "   - Your keystore password (password manager / sealed offline backup — NOT a plaintext file)"
echo ""
echo "3. Run hard reset to import database snapshot:"
echo "   See: https://docs.monad.xyz/node-ops/node-recovery/hard-reset"
echo ""
echo "4. Start services:"
echo "   systemctl start monad-bft monad-execution monad-rpc"
echo ""
echo "5. Register as validator (requires 100,000 MON self-stake):"
echo "   Use staking-sdk-cli: https://github.com/monad-developers/staking-sdk-cli"
echo ""`
  })()

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedScript(true)
      setTimeout(() => setCopiedScript(false), 2000)
    })
  }

  const downloadScript = () => {
    const blob = new Blob([installationScript], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'monad-validator-install.sh'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <motion.div
      className="validator-requirements-page"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
    >
      <div className="requirements-panel">
        <div className="requirements-header">
          <div className="requirements-title-section">
            <div className="requirements-title">
              <Server size={24} />
              <span>Validator Hardware</span>
            </div>
            <div className="requirements-subtitle">
              Minimum hardware specifications for running a Monad validator node
            </div>
          </div>
          <div className="requirements-actions">
            <Link className="requirements-link" to="/staking">Staking</Link>
            <Link className="requirements-link" to="/">Home</Link>
          </div>
        </div>

        {/* Tabs */}
        <div className="requirements-tabs">
          <button
            className={`requirements-tab ${activeTab === 'hardware' ? 'active' : ''}`}
            onClick={() => setActiveTab('hardware')}
          >
            <Server size={16} />
            <span>Hardware</span>
          </button>
          <button
            className={`requirements-tab ${activeTab === 'installation' ? 'active' : ''}`}
            onClick={() => setActiveTab('installation')}
          >
            <Terminal size={16} />
            <span>Installation</span>
          </button>
        </div>

        <div className="requirements-content">
          {activeTab === 'hardware' && (
            <>
          {/* Minimum Requirements */}
          <div className="requirements-section">
            <h2 className="section-title">
              <AlertCircle size={18} />
              <span>Minimum Requirements</span>
            </h2>
            <div className="requirements-grid">
              <div className="requirement-card">
                <div className="requirement-icon">
                  <Cpu size={24} />
                </div>
                <div className="requirement-content">
                  <h3>CPU</h3>
                  <ul>
                    <li><strong>Cores:</strong> 16+ physical cores</li>
                    <li><strong>Clock:</strong> 4.5GHz+ base frequency</li>
                    <li><strong>Architecture:</strong> AMD Zen 4+ or Intel Raptor Lake+</li>
                  </ul>
                  <div className="requirement-examples">
                    <span className="example-badge">AMD Ryzen 9 7950X</span>
                    <span className="example-badge">AMD EPYC 4584PX</span>
                  </div>
                </div>
              </div>

              <div className="requirement-card">
                <div className="requirement-icon">
                  <MemoryStick size={24} />
                </div>
                <div className="requirement-content">
                  <h3>Memory (RAM)</h3>
                  <ul>
                    <li><strong>Minimum:</strong> 32 GB DDR4/DDR5</li>
                    <li><strong>Recommended:</strong> 64 GB</li>
                    <li><strong>Speed:</strong> 3200MHz+</li>
                  </ul>
                  <div className="requirement-note">
                    💡 ECC memory recommended for production
                  </div>
                </div>
              </div>

              <div className="requirement-card">
                <div className="requirement-icon">
                  <HardDrive size={24} />
                </div>
                <div className="requirement-content">
                  <h3>Storage</h3>
                  <ul>
                    <li><strong>TrieDB:</strong> 2TB NVMe SSD</li>
                    <li><strong>MonadBFT/OS:</strong> 2TB NVMe SSD</li>
                    <li><strong>Interface:</strong> PCIe Gen4+</li>
                    <li><strong>IOPS:</strong> 1M+ random write</li>
                  </ul>
                  <div className="requirement-examples">
                    <span className="example-badge">Samsung 990 PRO</span>
                    <span className="example-badge">Samsung 9100 PRO</span>
                  </div>
                </div>
              </div>

              <div className="requirement-card">
                <div className="requirement-icon">
                  <Network size={24} />
                </div>
                <div className="requirement-content">
                  <h3>Network</h3>
                  <ul>
                    <li><strong>Bandwidth:</strong> 1 Gbps symmetric</li>
                    <li><strong>Latency:</strong> Low latency required</li>
                    <li><strong>Uptime:</strong> 99.9% required</li>
                  </ul>
                  <div className="requirement-note">
                    ⚠️ Static IP recommended
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Recommended Configurations */}
          <div className="requirements-section">
            <h2 className="section-title">
              <CheckCircle size={18} />
              <span>Recommended Configurations</span>
            </h2>
            <div className="config-grid">
              <div className="config-card">
                <h3>Budget Build</h3>
                <div className="config-specs">
                  <div className="spec-item">
                    <span className="spec-label">CPU:</span>
                    <span className="spec-value">AMD Ryzen 9 7950X</span>
                  </div>
                  <div className="spec-item">
                    <span className="spec-label">RAM:</span>
                    <span className="spec-value">64 GB DDR5-5600</span>
                  </div>
                  <div className="spec-item">
                    <span className="spec-label">Storage:</span>
                    <span className="spec-value">Samsung 990 PRO 2TB × 2</span>
                  </div>
                  <div className="spec-item">
                    <span className="spec-label">Network:</span>
                    <span className="spec-value">10 Gbps</span>
                  </div>
                </div>
              </div>

              <div className="config-card highlight">
                <h3>Production Build</h3>
                <div className="config-specs">
                  <div className="spec-item">
                    <span className="spec-label">CPU:</span>
                    <span className="spec-value">AMD EPYC 4584PX</span>
                  </div>
                  <div className="spec-item">
                    <span className="spec-label">RAM:</span>
                    <span className="spec-value">64 GB DDR5 ECC</span>
                  </div>
                  <div className="spec-item">
                    <span className="spec-label">Storage:</span>
                    <span className="spec-value">Samsung 9100 PRO 2TB × 2</span>
                  </div>
                  <div className="spec-item">
                    <span className="spec-label">Network:</span>
                    <span className="spec-value">10 Gbps</span>
                  </div>
                </div>
              </div>

              <div className="config-card">
                <h3>Enterprise Server</h3>
                <div className="config-specs">
                  <div className="spec-item">
                    <span className="spec-label">Server:</span>
                    <span className="spec-value">Supermicro AS-1015A-MT</span>
                  </div>
                  <div className="spec-item">
                    <span className="spec-label">CPU:</span>
                    <span className="spec-value">AMD EPYC 4584PX</span>
                  </div>
                  <div className="spec-item">
                    <span className="spec-label">RAM:</span>
                    <span className="spec-value">64 GB DDR5 ECC</span>
                  </div>
                  <div className="spec-item">
                    <span className="spec-label">Storage:</span>
                    <span className="spec-value">Samsung PM9A3 + 990 PRO</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Software Requirements */}
          <div className="requirements-section">
            <h2 className="section-title">
              <Server size={18} />
              <span>Software Requirements</span>
            </h2>
            <div className="software-card">
              <div className="software-item">
                <strong>Operating System:</strong> Ubuntu 24.04 LTS or newer
              </div>
              <div className="software-item">
                <strong>Kernel:</strong> Linux kernel ≥ v6.8.0.60-generic
              </div>
              <div className="software-warning">
                <AlertCircle size={16} />
                <span>
                  <strong>Warning:</strong> Kernel versions v6.8.0.56 - v6.8.0.59 contain critical bugs. 
                  Use v6.8.0.60 or newer.
                </span>
              </div>
            </div>
          </div>

          {/* Network Performance */}
          <div className="requirements-section">
            <h2 className="section-title">
              <Network size={18} />
              <span>Network Performance</span>
            </h2>
            <div className="network-card">
              <div className="network-metrics">
                <div className="metric-item">
                  <div className="metric-label">Firewall PPS</div>
                  <div className="metric-value">50,000+ PPS</div>
                  <div className="metric-note">Recommended: 70,000 PPS</div>
                </div>
                <div className="metric-item">
                  <div className="metric-label">Bandwidth</div>
                  <div className="metric-value">~42 MB/s</div>
                  <div className="metric-note">Peak network usage</div>
                </div>
                <div className="metric-item">
                  <div className="metric-label">Latency</div>
                  <div className="metric-value">Low</div>
                  <div className="metric-note">Critical for consensus</div>
                </div>
              </div>
            </div>
          </div>

          {/* Server Hosting */}
          <div className="requirements-section">
            <h2 className="section-title">
              <Server size={18} />
              <span>Need a Server?</span>
            </h2>
            <div className="hosting-card">
              <div className="hosting-content">
                <h3>Rent a Dedicated Server</h3>
                <p>
                  Get a high-performance dedicated server that meets Monad validator requirements. 
                  Choose from pre-configured options or customize your own.
                </p>
                <a
                  href="https://www.interserver.net/r/1054182"
                  target="_blank"
                  rel="noreferrer noopener"
                  className="hosting-button"
                >
                  <span>View Server Options</span>
                  <ExternalLink size={16} />
                </a>
              </div>
            </div>
          </div>

          {/* Additional Resources */}
          <div className="requirements-section">
            <h2 className="section-title">
              <ExternalLink size={18} />
              <span>Additional Resources</span>
            </h2>
            <div className="resources-grid">
              <a
                href="https://monadhcl.xyz/#baseline-hardware"
                target="_blank"
                rel="noreferrer noopener"
                className="resource-card"
              >
                <ExternalLink size={18} />
                <div>
                  <h4>Monad HCL</h4>
                  <p>Detailed hardware compatibility list</p>
                </div>
              </a>
              <a
                href="https://docs.monad.xyz/developer-essentials/staking/staking-behavior"
                target="_blank"
                rel="noreferrer noopener"
                className="resource-card"
              >
                <ExternalLink size={18} />
                <div>
                  <h4>Staking Documentation</h4>
                  <p>Official Monad staking guide</p>
                </div>
              </a>
            </div>
          </div>
          </>
          )}

          {activeTab === 'installation' && (
            <div className="installation-section">
              <div className="installation-header">
                <h2 className="section-title">
                  <Terminal size={18} />
                  <span>Node Installation Script</span>
                </h2>
                <p className="installation-description">
                  Automated installation script for Monad validator node. This script will set up all required components including system configuration, monad package installation, TrieDB setup, and service configuration.
                </p>
              </div>

              <div className="installation-warning">
                <AlertCircle size={18} />
                <div>
                  <strong>Important:</strong> This script requires root access and will configure your system. 
                  Make sure you have:
                  <ul>
                    <li>Ubuntu 24.04+ with Linux Kernel ≥ 6.8.0.60</li>
                    <li>Minimum hardware requirements met</li>
                    <li>NVMe drive ready for TrieDB (will be formatted)</li>
                    <li>Backup of any important data</li>
                  </ul>
                </div>
              </div>

              <div className="script-actions">
                <button
                  className="script-button primary"
                  onClick={downloadScript}
                >
                  <Download size={16} />
                  <span>Download Script</span>
                </button>
                <button
                  className="script-button"
                  onClick={() => copyToClipboard(installationScript)}
                >
                  <Copy size={16} />
                  <span>{copiedScript ? 'Copied!' : 'Copy Script'}</span>
                </button>
              </div>

              <div className="script-container">
                <div className="script-header">
                  <span className="script-filename">monad-validator-install.sh</span>
                  <button
                    className="script-copy-btn"
                    onClick={() => copyToClipboard(installationScript)}
                    title="Copy to clipboard"
                  >
                    <Copy size={14} />
                  </button>
                </div>
                <pre className="script-content">
                  <code>{installationScript}</code>
                </pre>
              </div>

              <div className="installation-steps">
                <h3>Installation Steps</h3>
                <div className="steps-list">
                  <div className="step-item">
                    <div className="step-number">1</div>
                    <div className="step-content">
                      <h4>Download or Copy Script</h4>
                      <p>Download the script file or copy it to your server</p>
                    </div>
                  </div>
                  <div className="step-item">
                    <div className="step-number">2</div>
                    <div className="step-content">
                      <h4>Make Executable</h4>
                      <code>chmod +x monad-validator-install.sh</code>
                    </div>
                  </div>
                  <div className="step-item">
                    <div className="step-number">3</div>
                    <div className="step-content">
                      <h4>Run as Root</h4>
                      <code>sudo ./monad-validator-install.sh</code>
                    </div>
                  </div>
                  <div className="step-item">
                    <div className="step-number">4</div>
                    <div className="step-content">
                      <h4>Configure node.toml</h4>
                      <p>Edit <code>/home/monad/monad-bft/config/node.toml</code> with your beneficiary address and node name</p>
                    </div>
                  </div>
                  <div className="step-item">
                    <div className="step-number">5</div>
                    <div className="step-content">
                      <h4>Backup Keystores</h4>
                      <p>Save <code>/opt/monad/backup/</code> files to external location</p>
                    </div>
                  </div>
                  <div className="step-item">
                    <div className="step-number">6</div>
                    <div className="step-content">
                      <h4>Start Services</h4>
                      <code>systemctl start monad-bft monad-execution monad-rpc</code>
                    </div>
                  </div>
                  <div className="step-item">
                    <div className="step-number">7</div>
                    <div className="step-content">
                      <h4>Register Validator</h4>
                      <p>Use <a href="https://github.com/monad-developers/staking-sdk-cli" target="_blank" rel="noreferrer">staking-sdk-cli</a> to register with minimum 100,000 MON self-stake</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="installation-notes">
                <h3>Additional Notes</h3>
                <ul>
                  <li>Script will prompt for NVMe drive path - make sure to use the correct drive</li>
                  <li>After installation, you need to run <strong>hard reset</strong> to import database snapshot</li>
                  <li>See <a href="https://docs.monad.xyz/node-ops/node-recovery/hard-reset" target="_blank" rel="noreferrer">hard reset documentation</a> for details</li>
                  <li>Validator must have at least 10M MON total stake to become active</li>
                  <li>Monitor node status using: <code>journalctl -u monad-bft -f</code></li>
                </ul>
              </div>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  )
}
