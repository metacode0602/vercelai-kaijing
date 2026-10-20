package state

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"path/filepath"
	"time"

	_ "github.com/mattn/go-sqlite3"
)

type Store struct {
	db *sql.DB
}

func New(stateDir string) (*Store, error) {
	dbPath := filepath.Join(stateDir, "state.db")
	db, err := sql.Open("sqlite3", dbPath+"?_journal_mode=WAL&_busy_timeout=5000")
	if err != nil {
		return nil, fmt.Errorf("open sqlite: %w", err)
	}

	s := &Store{db: db}
	if err := s.migrate(); err != nil {
		return nil, fmt.Errorf("migrate: %w", err)
	}

	return s, nil
}

func (s *Store) migrate() error {
	_, err := s.db.Exec(`
	CREATE TABLE IF NOT EXISTS tasks (
		id          TEXT PRIMARY KEY,
		type        TEXT NOT NULL,
		status      TEXT NOT NULL DEFAULT 'pending',
		priority    INTEGER DEFAULT 0,
		payload     TEXT NOT NULL,
		stages_json TEXT,
		retry_count INTEGER DEFAULT 0,
		max_retries INTEGER DEFAULT 3,
		error       TEXT,
		created_at  TEXT NOT NULL,
		started_at  TEXT,
		finished_at TEXT
	);
		CREATE TABLE IF NOT EXISTS device_cache (
			sn           TEXT PRIMARY KEY,
			internal_ip  TEXT,
			node_name    TEXT,
			gpu_type     TEXT,
			gpu_count    INTEGER,
			os_id        TEXT,
			os_version   TEXT,
			labels_json  TEXT,
			last_probed_at TEXT,
			updated_at   TEXT
		);
		CREATE TABLE IF NOT EXISTS audit_log (
			id          INTEGER PRIMARY KEY AUTOINCREMENT,
			task_id     TEXT,
			action      TEXT NOT NULL,
			details     TEXT,
			created_at  TEXT NOT NULL
		);
		CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
		CREATE INDEX IF NOT EXISTS idx_tasks_type_status ON tasks(type, status);
	`)
	return err
}

func (s *Store) GetPendingTasks() ([]Task, error) {
	rows, err := s.db.Query(`
		SELECT id, type, status, priority, payload, stages_json, retry_count, max_retries, error, created_at
		FROM tasks WHERE status IN ('pending', 'running') ORDER BY priority DESC, created_at ASC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var tasks []Task
	for rows.Next() {
		var t Task
		var createdAt string
		var payloadStr string
		var stagesJSON, errStr sql.NullString
		var startedAt, finishedAt sql.NullString
		if err := rows.Scan(&t.ID, &t.Type, &t.Status, &t.Priority, &payloadStr, &stagesJSON, &t.RetryCount, &t.MaxRetries, &errStr, &createdAt); err != nil {
			return nil, err
		}
		t.Payload = json.RawMessage(payloadStr)
		t.CreatedAt, _ = time.Parse(time.RFC3339, createdAt)
		if stagesJSON.Valid {
			t.StagesJSON = stagesJSON.String
		}
		if errStr.Valid {
			t.Error = errStr.String
		}
		if startedAt.Valid {
			parsed, _ := time.Parse(time.RFC3339, startedAt.String)
			t.StartedAt = &parsed
		}
		if finishedAt.Valid {
			parsed, _ := time.Parse(time.RFC3339, finishedAt.String)
			t.FinishedAt = &parsed
		}
		tasks = append(tasks, t)
	}
	return tasks, nil
}

func (s *Store) InsertTask(t Task) error {
	payload, _ := json.Marshal(t.Payload)
	_, err := s.db.Exec(`
		INSERT OR IGNORE INTO tasks (id, type, status, priority, payload, retry_count, max_retries, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)
	`, t.ID, t.Type, t.Status, t.Priority, string(payload), t.RetryCount, t.MaxRetries, t.CreatedAt.Format(time.RFC3339))
	return err
}

func (s *Store) UpdateTaskStatus(id string, status TaskStatus, stagesJSON string, errMsg string) error {
	now := time.Now().Format(time.RFC3339)
	if status == TaskStatusRunning {
		_, err := s.db.Exec(`UPDATE tasks SET status = ?, started_at = ? WHERE id = ?`, status, now, id)
		return err
	}
	_, err := s.db.Exec(`UPDATE tasks SET status = ?, stages_json = ?, error = ?, finished_at = ? WHERE id = ?`,
		status, stagesJSON, errMsg, now, id)
	return err
}

func (s *Store) IncrementRetry(id string) error {
	_, err := s.db.Exec(`UPDATE tasks SET retry_count = retry_count + 1 WHERE id = ?`, id)
	return err
}

func (s *Store) SaveDeviceCache(d DeviceCache) error {
	_, err := s.db.Exec(`
		INSERT OR REPLACE INTO device_cache (sn, internal_ip, node_name, gpu_type, gpu_count, os_id, os_version, labels_json, last_probed_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`, d.SN, d.InternalIP, d.NodeName, d.GPUType, d.GPUCount, d.OSID, d.OSVersion, d.LabelsJSON, d.LastProbed, d.UpdatedAt)
	return err
}

func (s *Store) GetDeviceCache(sn string) (*DeviceCache, error) {
	row := s.db.QueryRow(`SELECT sn, internal_ip, node_name, gpu_type, gpu_count, os_id, os_version, labels_json FROM device_cache WHERE sn = ?`, sn)
	var d DeviceCache
	var labelsJSON sql.NullString
	err := row.Scan(&d.SN, &d.InternalIP, &d.NodeName, &d.GPUType, &d.GPUCount, &d.OSID, &d.OSVersion, &labelsJSON)
	if err != nil {
		return nil, err
	}
	if labelsJSON.Valid {
		d.LabelsJSON = labelsJSON.String
	}
	return &d, nil
}

func (s *Store) WriteAuditLog(taskID, action, details string) error {
	_, err := s.db.Exec(`INSERT INTO audit_log (task_id, action, details, created_at) VALUES (?, ?, ?, ?)`,
		taskID, action, details, time.Now().Format(time.RFC3339))
	return err
}

func (s *Store) DeviceCount() int {
	var count int
	s.db.QueryRow(`SELECT COUNT(*) FROM device_cache`).Scan(&count)
	return count
}

func (s *Store) Close() error {
	return s.db.Close()
}
