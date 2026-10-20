package gpu

import (
	"testing"
)

func TestParseNvidiaSmi(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected []GPUInfo
	}{
		{
			name:  "single GPU",
			input: "NVIDIA A100-SXM4-80GB, 1, 81920 MiB",
			expected: []GPUInfo{
				{Name: "NVIDIA A100-SXM4-80GB", Count: 1, Memory: "81920 MiB"},
			},
		},
		{
			name:  "multiple GPUs same type",
			input: "NVIDIA A100-SXM4-80GB, 1, 81920 MiB\nNVIDIA A100-SXM4-80GB, 1, 81920 MiB",
			expected: []GPUInfo{
				{Name: "NVIDIA A100-SXM4-80GB", Count: 1, Memory: "81920 MiB"},
				{Name: "NVIDIA A100-SXM4-80GB", Count: 1, Memory: "81920 MiB"},
			},
		},
		{
			name:  "empty input",
			input: "",
			expected: nil,
		},
		{
			name:  "H100 GPU",
			input: "NVIDIA H100 80GB HBM3, 1, 81559 MiB",
			expected: []GPUInfo{
				{Name: "NVIDIA H100 80GB HBM3", Count: 1, Memory: "81559 MiB"},
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := ParseNvidiaSmi(tt.input)
			if len(result) != len(tt.expected) {
				t.Errorf("ParseNvidiaSmi() returned %d GPUs, expected %d", len(result), len(tt.expected))
				return
			}
			for i, g := range result {
				if g.Name != tt.expected[i].Name {
					t.Errorf("GPU[%d].Name = %q, expected %q", i, g.Name, tt.expected[i].Name)
				}
				if g.Count != tt.expected[i].Count {
					t.Errorf("GPU[%d].Count = %d, expected %d", i, g.Count, tt.expected[i].Count)
				}
			}
		})
	}
}

func TestTotalCount(t *testing.T) {
	tests := []struct {
		name     string
		gpus     []GPUInfo
		expected int
	}{
		{"empty", nil, 0},
		{"single", []GPUInfo{{Count: 1}}, 1},
		{"multiple", []GPUInfo{{Count: 2}, {Count: 3}}, 5},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := TotalCount(tt.gpus); got != tt.expected {
				t.Errorf("TotalCount() = %d, expected %d", got, tt.expected)
			}
		})
	}
}

func TestNormalizeName(t *testing.T) {
	tests := []struct {
		input    string
		expected string
	}{
		{"NVIDIA A100 80GB", "a10080gb"},
		{"nvidia h100", "h100"},
		{"A100-SXM4-80GB", "a100-sxm4-80gb"},
	}

	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			if got := NormalizeName(tt.input); got != tt.expected {
				t.Errorf("NormalizeName(%q) = %q, expected %q", tt.input, got, tt.expected)
			}
		})
	}
}

func TestGPUCheck(t *testing.T) {
	gpus := []GPUInfo{
		{Name: "NVIDIA A100-SXM4-80GB", Count: 1, Memory: "81920 MiB"},
		{Name: "NVIDIA A100-SXM4-80GB", Count: 1, Memory: "81920 MiB"},
	}

	t.Run("matching", func(t *testing.T) {
		err := GPUCheck(gpus, "NVIDIA A100-SXM4-80GB", 2)
		if err != nil {
			t.Errorf("GPUCheck() unexpected error: %v", err)
		}
	})

	t.Run("wrong count", func(t *testing.T) {
		err := GPUCheck(gpus, "NVIDIA A100-SXM4-80GB", 4)
		if err == nil {
			t.Error("GPUCheck() expected error for wrong count")
		}
	})

	t.Run("wrong type", func(t *testing.T) {
		err := GPUCheck(gpus, "NVIDIA H100 80GB", 2)
		if err == nil {
			t.Error("GPUCheck() expected error for wrong type")
		}
	})
}

func TestNames(t *testing.T) {
	gpus := []GPUInfo{
		{Name: "NVIDIA A100", Count: 1},
		{Name: "NVIDIA A100", Count: 1},
		{Name: "NVIDIA H100", Count: 1},
	}

	names := Names(gpus)
	if len(names) != 2 {
		t.Errorf("Names() returned %d names, expected 2", len(names))
	}
}
