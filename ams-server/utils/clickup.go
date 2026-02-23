package utils

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strconv"
	"time"
)

type clickUpTask struct {
	Name        string  `json:"name"`
	Description string  `json:"description"`
	Priority    int     `json:"priority"`
	DueDate     int64   `json:"due_date"`
	DueDateTime bool    `json:"due_date_time"`
	Assignees   []int64 `json:"assignees"`
}

// priority levels: 1=urgent, 2=high, 3=normal, 4=low
func clickUpPriority(expiryDate time.Time) int {
	daysUntilExpiry := int(time.Until(expiryDate).Hours() / 24)
	if daysUntilExpiry <= 7 {
		return 2 // high
	}
	return 3 // normal
}

func CreateClickUpTask(certificateName, assetName, componentName string, expiryDate time.Time) (string, error) {
	apiToken := os.Getenv("CLICKUP_API_TOKEN")
	listID := os.Getenv("CLICKUP_LIST_ID")
	assignees := []int64{}
	if idStr := os.Getenv("CLICKUP_ASSIGNEE_ID"); idStr != "" {
		if id, err := strconv.ParseInt(idStr, 10, 64); err == nil {
			assignees = append(assignees, id)
		}
	}

	if apiToken == "" || listID == "" {
		return "", fmt.Errorf("CLICKUP_API_TOKEN or CLICKUP_LIST_ID not set")
	}

	// Due date is 7 days before expiry
	dueDate := expiryDate.AddDate(0, 0, -7)
	dueDateMs := dueDate.UnixMilli()

	description := fmt.Sprintf(
		"Certificate expiry alert:\n\nAsset: %s\nComponent: %s\nCertificate: %s\nExpiry Date: %s\n\nPlease take action to renew this certificate before it expires.",
		assetName,
		componentName,
		certificateName,
		expiryDate.Format("2006-01-02"),
	)

	task := clickUpTask{
		Name:        fmt.Sprintf("Certificate Expiring: %s", certificateName),
		Description: description,
		Priority:    clickUpPriority(expiryDate),
		DueDate:     dueDateMs,
		DueDateTime: false,
		Assignees:   assignees,
	}

	body, err := json.Marshal(task)
	if err != nil {
		return "", fmt.Errorf("failed to marshal task: %v", err)
	}

	url := fmt.Sprintf("https://api.clickup.com/api/v2/list/%s/task", listID)
	req, err := http.NewRequest(http.MethodPost, url, bytes.NewBuffer(body))
	if err != nil {
		return "", fmt.Errorf("failed to create request: %v", err)
	}

	req.Header.Set("Authorization", apiToken)
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("failed to send request to ClickUp: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
		return "", fmt.Errorf("ClickUp API returned status %d", resp.StatusCode)
	}

	// Extract the task ID from the response
	var result struct {
		ID string `json:"id"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", fmt.Errorf("failed to decode ClickUp response: %v", err)
	}

	if result.ID == "" {
		return "", fmt.Errorf("ClickUp returned empty task ID")
	}

	return result.ID, nil
}
