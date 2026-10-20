package config

import (
	"os"

	"gopkg.in/yaml.v3"
)

type Config struct {
	AgentID    string `yaml:"agent_id"`
	AgentToken string `yaml:"agent_token"`
	APIURL     string `yaml:"api_url"`
	Datacenter string `yaml:"datacenter"`

	ListenAddr string `yaml:"listen_addr"`
	StateDir   string `yaml:"state_dir"`

	LogLevel string `yaml:"log_level"`
	LogFile  string `yaml:"log_file"`

	SSH     SSHConfig     `yaml:"ssh"`
	K8s     K8sConfig     `yaml:"k8s"`
	Polling PollingConfig `yaml:"polling"`
	Retry   RetryConfig   `yaml:"retry"`
	Health  HealthConfig  `yaml:"health"`
}

type SSHConfig struct {
	ConcurrencyLimit int      `yaml:"concurrent_limit"`
	ConnectTimeout   int      `yaml:"connect_timeout"`
	CommandTimeout   int      `yaml:"command_timeout"`
	PreferredAuth    []string `yaml:"preferred_auth"`
	Bastion          Bastion  `yaml:"bastion"`
}

type Bastion struct {
	Host           string `yaml:"host"`
	Port           string `yaml:"port"`
	User           string `yaml:"user"`
	PrivateKeyPath string `yaml:"private_key_path"`
}

type K8sConfig struct {
	KubeconfigPath string            `yaml:"kubeconfig_path"`
	DefaultLabels  map[string]string `yaml:"default_labels"`
}

type PollingConfig struct {
	TaskInterval      int `yaml:"task_interval"`
	HeartbeatInterval int `yaml:"heartbeat_interval"`
}

type RetryConfig struct {
	MaxAttempts int `yaml:"max_attempts"`
	BackoffBase int `yaml:"backoff_base"`
	BackoffMax  int `yaml:"backoff_max"`
}

type HealthConfig struct {
	SSHProbeInterval      int `yaml:"ssh_probe_interval"`
	SSHConsecutiveFailMax int `yaml:"ssh_consecutive_fail_max"`
	NodeReadyTimeout      int `yaml:"node_ready_timeout"`
}

func Load(path string) (*Config, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}

	cfg := DefaultConfig()
	if err := yaml.Unmarshal(data, cfg); err != nil {
		return nil, err
	}

	return cfg, nil
}

func DefaultConfig() *Config {
	return &Config{
		ListenAddr: ":9090",
		StateDir:   "/etc/openroute",
		LogLevel:   "info",
		SSH: SSHConfig{
			ConcurrencyLimit: 20,
			ConnectTimeout:   10,
			CommandTimeout:   60,
			PreferredAuth:    []string{"publickey", "password"},
		},
		Polling: PollingConfig{
			TaskInterval:      15,
			HeartbeatInterval: 30,
		},
		Retry: RetryConfig{
			MaxAttempts: 3,
			BackoffBase: 10,
			BackoffMax:  300,
		},
		Health: HealthConfig{
			SSHProbeInterval:      1800,
			SSHConsecutiveFailMax: 3,
			NodeReadyTimeout:      300,
		},
	}
}
