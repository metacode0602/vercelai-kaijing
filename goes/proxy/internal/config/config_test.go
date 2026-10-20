package config

import (
	"os"
	"path/filepath"
	"testing"
)

func TestLoadConfig(t *testing.T) {
	content := `
agent_id: "test-agent-id"
agent_token: "oat_test_token"
api_url: "https://api.test.com"
datacenter: "TEST-DC-01"
listen_addr: ":9091"
state_dir: "/tmp/test-state"
log_level: "debug"
ssh:
  concurrent_limit: 10
  connect_timeout: 5
  command_timeout: 30
  preferred_auth: ["password"]
  bastion:
    host: "bastion.test.com"
    port: "22"
    user: "admin"
    private_key_path: "/tmp/bastion_key"
k8s:
  kubeconfig_path: "/tmp/kubeconfig"
  default_labels:
    "test.io/label": "value"
polling:
  task_interval: 10
  heartbeat_interval: 20
retry:
  max_attempts: 5
  backoff_base: 5
  backoff_max: 120
health:
  ssh_probe_interval: 900
  ssh_consecutive_fail_max: 5
  node_ready_timeout: 180
`

	dir := t.TempDir()
	path := filepath.Join(dir, "agent.yaml")
	if err := os.WriteFile(path, []byte(content), 0644); err != nil {
		t.Fatalf("failed to write test config: %v", err)
	}

	cfg, err := Load(path)
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}

	if cfg.AgentID != "test-agent-id" {
		t.Errorf("AgentID = %q, expected %q", cfg.AgentID, "test-agent-id")
	}
	if cfg.APIURL != "https://api.test.com" {
		t.Errorf("APIURL = %q, expected %q", cfg.APIURL, "https://api.test.com")
	}
	if cfg.SSH.ConcurrencyLimit != 10 {
		t.Errorf("SSH.ConcurrencyLimit = %d, expected 10", cfg.SSH.ConcurrencyLimit)
	}
	if cfg.SSH.Bastion.Host != "bastion.test.com" {
		t.Errorf("SSH.Bastion.Host = %q, expected %q", cfg.SSH.Bastion.Host, "bastion.test.com")
	}
	if cfg.Polling.TaskInterval != 10 {
		t.Errorf("Polling.TaskInterval = %d, expected 10", cfg.Polling.TaskInterval)
	}
	if cfg.Retry.MaxAttempts != 5 {
		t.Errorf("Retry.MaxAttempts = %d, expected 5", cfg.Retry.MaxAttempts)
	}
	if cfg.Health.NodeReadyTimeout != 180 {
		t.Errorf("Health.NodeReadyTimeout = %d, expected 180", cfg.Health.NodeReadyTimeout)
	}
}

func TestDefaultConfig(t *testing.T) {
	cfg := DefaultConfig()

	if cfg.ListenAddr != ":9090" {
		t.Errorf("DefaultConfig().ListenAddr = %q, expected %q", cfg.ListenAddr, ":9090")
	}
	if cfg.SSH.ConcurrencyLimit != 20 {
		t.Errorf("DefaultConfig().SSH.ConcurrencyLimit = %d, expected 20", cfg.SSH.ConcurrencyLimit)
	}
	if cfg.Polling.TaskInterval != 15 {
		t.Errorf("DefaultConfig().Polling.TaskInterval = %d, expected 15", cfg.Polling.TaskInterval)
	}
	if cfg.Retry.MaxAttempts != 3 {
		t.Errorf("DefaultConfig().Retry.MaxAttempts = %d, expected 3", cfg.Retry.MaxAttempts)
	}
}

func TestLoadConfigMissingFile(t *testing.T) {
	_, err := Load("/nonexistent/agent.yaml")
	if err == nil {
		t.Error("Load() expected error for missing file")
	}
}

func TestLoadConfigInvalidYAML(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "agent.yaml")
	if err := os.WriteFile(path, []byte("not: valid: yaml: ["), 0644); err != nil {
		t.Fatalf("failed to write test config: %v", err)
	}

	_, err := Load(path)
	if err == nil {
		t.Error("Load() expected error for invalid YAML")
	}
}
