package update

import (
	"archive/tar"
	"compress/gzip"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"time"
)

type VersionInfo struct {
	Latest   string   `json:"latest"`
	Versions []string `json:"versions"`
}

type Updater struct {
	currentVersion string
	apiURL         string
	installDir     string
	httpClient     *http.Client
	logger         *slog.Logger
}

func New(currentVersion, apiURL, installDir string, logger *slog.Logger) *Updater {
	return &Updater{
		currentVersion: currentVersion,
		apiURL:         apiURL,
		installDir:     installDir,
		httpClient: &http.Client{
			Timeout: 60 * time.Second,
		},
		logger: logger,
	}
}

func (u *Updater) CheckAndApply(ctx context.Context) error {
	info, err := u.fetchVersionInfo(ctx)
	if err != nil {
		return fmt.Errorf("fetch version info: %w", err)
	}

	if info.Latest == u.currentVersion {
		u.logger.Info("already up to date", "version", u.currentVersion)
		return nil
	}

	u.logger.Info("new version available", "current", u.currentVersion, "latest", info.Latest)

	if err := u.download(ctx, info.Latest); err != nil {
		return fmt.Errorf("download: %w", err)
	}

	u.logger.Info("update applied successfully", "version", info.Latest)
	return nil
}

func (u *Updater) fetchVersionInfo(ctx context.Context) (*VersionInfo, error) {
	req, err := http.NewRequestWithContext(ctx, "GET", u.apiURL+"/api/agent/version", nil)
	if err != nil {
		return nil, err
	}

	resp, err := u.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var info VersionInfo
	if err := json.NewDecoder(resp.Body).Decode(&info); err != nil {
		return nil, err
	}

	return &info, nil
}

func (u *Updater) download(ctx context.Context, version string) error {
	arch := runtime.GOARCH
	if arch == "amd64" {
		arch = "amd64"
	} else if arch == "arm64" {
		arch = "arm64"
	}

	downloadURL := fmt.Sprintf("%s/api/agent/downloads/%s/openroute-agent-linux-%s.tar.gz",
		u.apiURL, version, arch)

	req, err := http.NewRequestWithContext(ctx, "GET", downloadURL, nil)
	if err != nil {
		return err
	}

	resp, err := u.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return fmt.Errorf("download failed: HTTP %d", resp.StatusCode)
	}

	// Download to temp file
	tmpFile, err := os.CreateTemp("", "openroute-agent-*.tar.gz")
	if err != nil {
		return err
	}
	defer os.Remove(tmpFile.Name())

	hasher := sha256.New()
	writer := io.MultiWriter(tmpFile, hasher)

	if _, err := io.Copy(writer, resp.Body); err != nil {
		tmpFile.Close()
		return err
	}
	tmpFile.Close()

	checksum := hex.EncodeToString(hasher.Sum(nil))
	u.logger.Info("download complete", "checksum", checksum)

	// Verify checksum if provided
	if checksumHeader := resp.Header.Get("X-Checksum-SHA256"); checksumHeader != "" {
		if checksum != checksumHeader {
			return fmt.Errorf("checksum mismatch: expected %s, got %s", checksumHeader, checksum)
		}
	}

	// Extract binary
	return u.extract(tmpFile.Name())
}

func (u *Updater) extract(tarPath string) error {
	f, err := os.Open(tarPath)
	if err != nil {
		return err
	}
	defer f.Close()

	gz, err := gzip.NewReader(f)
	if err != nil {
		return err
	}
	defer gz.Close()

	tr := tar.NewReader(gz)
	for {
		header, err := tr.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			return err
		}

		if header.Typeflag != tar.TypeReg {
			continue
		}

		name := filepath.Base(header.Name)
		if name != "openroute-agent" {
			continue
		}

		// Write to temp file, then rename (atomic)
		target := filepath.Join(u.installDir, name)
		tmpTarget := target + ".tmp"

		out, err := os.Create(tmpTarget)
		if err != nil {
			return err
		}

		if _, err := io.Copy(out, tr); err != nil {
			out.Close()
			os.Remove(tmpTarget)
			return err
		}
		out.Close()

		// Make executable
		if err := os.Chmod(tmpTarget, 0755); err != nil {
			os.Remove(tmpTarget)
			return err
		}

		// Atomic rename
		if err := os.Rename(tmpTarget, target); err != nil {
			os.Remove(tmpTarget)
			return err
		}

		u.logger.Info("binary updated", "path", target)
		return nil
	}

	return fmt.Errorf("openroute-agent binary not found in archive")
}
