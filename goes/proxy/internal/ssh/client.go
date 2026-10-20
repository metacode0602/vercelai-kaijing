package ssh

import (
	"bytes"
	"fmt"
	"io"
	"net"
	"os"
	"strings"
	"time"

	"golang.org/x/crypto/ssh"

	"github.com/openroute/goes/proxy/internal/config"
)

type Client struct {
	cfg       config.SSHConfig
	bastion   *ssh.Client
}

func New(cfg config.SSHConfig) *Client {
	return &Client{cfg: cfg}
}

func (c *Client) ConnectBastion() error {
	if c.cfg.Bastion.Host == "" {
		return nil
	}

	signer, err := c.loadSigner()
	if err != nil {
		return fmt.Errorf("load bastion key: %w", err)
	}

	bastionCfg := &ssh.ClientConfig{
		User:            c.cfg.Bastion.User,
		Auth:            []ssh.AuthMethod{ssh.PublicKeys(signer)},
		HostKeyCallback: ssh.InsecureIgnoreHostKey(),
		Timeout:         time.Duration(c.cfg.ConnectTimeout) * time.Second,
	}

	bastion, err := ssh.Dial("tcp", net.JoinHostPort(c.cfg.Bastion.Host, c.cfg.Bastion.Port), bastionCfg)
	if err != nil {
		return fmt.Errorf("dial bastion: %w", err)
	}
	c.bastion = bastion
	return nil
}

func (c *Client) Dial(deviceIP, user, password string) (*ssh.Client, error) {
	cfg := &ssh.ClientConfig{
		User:            user,
		Auth:            []ssh.AuthMethod{ssh.Password(password)},
		HostKeyCallback: ssh.InsecureIgnoreHostKey(),
		Timeout:         time.Duration(c.cfg.ConnectTimeout) * time.Second,
	}

	if c.bastion != nil {
		return c.dialViaBastion(deviceIP, cfg)
	}

	return ssh.Dial("tcp", net.JoinHostPort(deviceIP, "22"), cfg)
}

func (c *Client) dialViaBastion(deviceIP string, cfg *ssh.ClientConfig) (*ssh.Client, error) {
	conn, err := c.bastion.Dial("tcp", net.JoinHostPort(deviceIP, "22"))
	if err != nil {
		return nil, fmt.Errorf("bastion dial: %w", err)
	}

	ncc, chans, reqs, err := ssh.NewClientConn(conn, net.JoinHostPort(deviceIP, "22"), cfg)
	if err != nil {
		conn.Close()
		return nil, fmt.Errorf("ssh handshake via bastion: %w", err)
	}

	return ssh.NewClient(ncc, chans, reqs), nil
}

func (c *Client) RunCommand(client *ssh.Client, cmd string) (string, error) {
	session, err := client.NewSession()
	if err != nil {
		return "", fmt.Errorf("new session: %w", err)
	}
	defer session.Close()

	var stdout, stderr bytes.Buffer
	session.Stdout = &stdout
	session.Stderr = &stderr

	err = session.Run(cmd)
	output := stdout.String() + stderr.String()
	if err != nil {
		return output, fmt.Errorf("run %q: %w (output: %s)", cmd, err, output)
	}
	return strings.TrimSpace(output), nil
}

func (c *Client) UploadFile(client *ssh.Client, remotePath string, content []byte) error {
	session, err := client.NewSession()
	if err != nil {
		return fmt.Errorf("new session: %w", err)
	}
	defer session.Close()

	stdin, err := session.StdinPipe()
	if err != nil {
		return err
	}

	go func() {
		defer stdin.Close()
		io.Copy(stdin, bytes.NewReader(content))
	}()

	cmd := fmt.Sprintf("cat > %s", remotePath)
	return session.Run(cmd)
}

func (c *Client) loadSigner() (ssh.Signer, error) {
	keyPath := c.cfg.Bastion.PrivateKeyPath
	if keyPath == "" {
		return nil, fmt.Errorf("bastion private key path not configured")
	}

	key, err := os.ReadFile(keyPath)
	if err != nil {
		return nil, err
	}

	return ssh.ParsePrivateKey(key)
}
