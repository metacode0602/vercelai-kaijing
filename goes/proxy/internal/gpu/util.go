package gpu

import (
	"fmt"
	"strconv"
	"strings"
)

type GPUInfo struct {
	Name  string
	Count int
	Memory string
}

func ParseNvidiaSmi(output string) []GPUInfo {
	var gpus []GPUInfo
	lines := strings.Split(strings.TrimSpace(output), "\n")

	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}

		parts := strings.Split(line, ",")
		if len(parts) < 3 {
			continue
		}

		gpu := GPUInfo{
			Name:   strings.TrimSpace(parts[0]),
			Memory: strings.TrimSpace(parts[2]),
		}

		countStr := strings.TrimSpace(parts[1])
		if c, err := strconv.Atoi(countStr); err == nil {
			gpu.Count = c
		} else {
			gpu.Count = 1
		}

		gpus = append(gpus, gpu)
	}

	return gpus
}

func TotalCount(gpus []GPUInfo) int {
	total := 0
	for _, g := range gpus {
		total += g.Count
	}
	return total
}

func NormalizeName(name string) string {
	name = strings.ToLower(name)
	name = strings.ReplaceAll(name, "nvidia ", "")
	name = strings.ReplaceAll(name, " ", "")
	return name
}

func Names(gpus []GPUInfo) []string {
	var names []string
	seen := map[string]bool{}
	for _, g := range gpus {
		if !seen[g.Name] {
			names = append(names, g.Name)
			seen[g.Name] = true
		}
	}
	return names
}

func GPUTypeToK8sLabel(gpuType string) string {
	lower := strings.ToLower(gpuType)
	lower = strings.ReplaceAll(lower, "nvidia ", "")
	lower = strings.ReplaceAll(lower, " ", "-")
	return lower
}

func GPUCountLabel(count int) string {
	return strconv.Itoa(count)
}

func FormatMemory(total string) string {
	return strings.TrimSpace(total)
}

func GPUCheck(actual []GPUInfo, expectedType string, expectedCount int) error {
	actualCount := TotalCount(actual)
	if actualCount != expectedCount {
		return fmt.Errorf("GPU count mismatch: actual %d vs expected %d", actualCount, expectedCount)
	}

	typeMatched := false
	for _, g := range actual {
		if NormalizeName(g.Name) == NormalizeName(expectedType) {
			typeMatched = true
			break
		}
	}

	if !typeMatched {
		return fmt.Errorf("GPU type mismatch: expected %s, got %v", expectedType, Names(actual))
	}

	return nil
}
