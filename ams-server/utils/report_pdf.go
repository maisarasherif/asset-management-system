package utils

import (
	"bytes"
	"fmt"
	"strings"
	"time"
)

const (
	reportPageWidth  = 842
	reportPageHeight = 595

	reportMarginLeft   = 36
	reportMarginRight  = 36
	reportMarginTop    = 34
	reportMarginBottom = 28

	reportContentWidth = reportPageWidth - reportMarginLeft - reportMarginRight

	reportFontRegular = "F1"
	reportFontBold    = "F2"

	reportBodyFont  = 10.0
	reportMetaFont  = 8.0
	reportLineGap   = 13.0
	reportBlockPad  = 12.0
	reportHeaderGap = 86.0
)

type CertificateReportRow struct {
	CertificateName    string
	CertificateID      string
	ComponentName      string
	ComponentID        string
	AssetName          string
	AssetID            string
	LastInspectionDate string
	NextInspectionDate string
	Status             string
	IssuingAuthority   string
}

type AssetCertificateSheetRow struct {
	ComponentName         string
	ComponentID           string
	ComponentSerialNumber string
	CertificateNumber     string
	IssueDate             string
	ExpiryDate            string
	IMCAD018Details       string
	TestType              string
	Status                string
}

type reportCounts struct {
	total    int
	valid    int
	expiring int
	expired  int
}

type reportBlock struct {
	lines  []reportLine
	height float64
}

type reportLine struct {
	font string
	size float64
	text string
	r    float64
	g    float64
	b    float64
}

type assetSheetColumn struct {
	label    string
	width    float64
	maxLines int
	value    func(AssetCertificateSheetRow) string
}

type assetSheetRenderedRow struct {
	cells  [][]string
	source AssetCertificateSheetRow
	height float64
}

func BuildCertificateReportPDF(generatedAt time.Time, rows []CertificateReportRow) ([]byte, error) {
	blocks := buildReportBlocks(rows)
	pages := paginateReportBlocks(blocks)
	counts := calculateReportCounts(rows)

	totalObjects := 4 + len(pages)*2
	offsets := make([]int, totalObjects+1)
	var buf bytes.Buffer

	write := func(value string) {
		_, _ = buf.WriteString(value)
	}

	writeObject := func(number int, body string) {
		offsets[number] = buf.Len()
		write(fmt.Sprintf("%d 0 obj\n%s\nendobj\n", number, body))
	}

	write("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n")

	var kids strings.Builder
	for i := range pages {
		if i > 0 {
			kids.WriteByte(' ')
		}
		kids.WriteString(fmt.Sprintf("%d 0 R", 5+i*2))
	}

	writeObject(1, "<< /Type /Catalog /Pages 2 0 R >>")
	writeObject(2, fmt.Sprintf("<< /Type /Pages /Kids [%s] /Count %d >>", kids.String(), len(pages)))
	writeObject(3, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")
	writeObject(4, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>")

	for i, pageBlocks := range pages {
		pageObjectNumber := 5 + i*2
		contentObjectNumber := pageObjectNumber + 1
		content := buildReportPageContent(i+1, len(pages), generatedAt, counts, pageBlocks)

		writeObject(pageObjectNumber, fmt.Sprintf(
			"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 %d %d] /Resources << /Font << /%s 3 0 R /%s 4 0 R >> >> /Contents %d 0 R >>",
			reportPageWidth,
			reportPageHeight,
			reportFontRegular,
			reportFontBold,
			contentObjectNumber,
		))
		writeObject(contentObjectNumber, fmt.Sprintf("<< /Length %d >>\nstream\n%sendstream", len(content), content))
	}

	xrefOffset := buf.Len()
	write(fmt.Sprintf("xref\n0 %d\n", totalObjects+1))
	write("0000000000 65535 f \n")
	for i := 1; i <= totalObjects; i++ {
		write(fmt.Sprintf("%010d 00000 n \n", offsets[i]))
	}
	write(fmt.Sprintf("trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF", totalObjects+1, xrefOffset))

	return buf.Bytes(), nil
}

func BuildAssetCertificateSheetPDF(generatedAt time.Time, assetName, assetID string, rows []AssetCertificateSheetRow) ([]byte, error) {
	columns := assetCertificateSheetColumns()
	renderedRows := buildAssetSheetRows(rows, columns)
	pages := paginateAssetSheetRows(renderedRows)
	counts := calculateAssetSheetCounts(rows)

	totalObjects := 4 + len(pages)*2
	offsets := make([]int, totalObjects+1)
	var buf bytes.Buffer

	write := func(value string) {
		_, _ = buf.WriteString(value)
	}

	writeObject := func(number int, body string) {
		offsets[number] = buf.Len()
		write(fmt.Sprintf("%d 0 obj\n%s\nendobj\n", number, body))
	}

	write("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n")

	var kids strings.Builder
	for i := range pages {
		if i > 0 {
			kids.WriteByte(' ')
		}
		kids.WriteString(fmt.Sprintf("%d 0 R", 5+i*2))
	}

	writeObject(1, "<< /Type /Catalog /Pages 2 0 R >>")
	writeObject(2, fmt.Sprintf("<< /Type /Pages /Kids [%s] /Count %d >>", kids.String(), len(pages)))
	writeObject(3, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")
	writeObject(4, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>")

	for i, pageRows := range pages {
		pageObjectNumber := 5 + i*2
		contentObjectNumber := pageObjectNumber + 1
		content := buildAssetSheetPageContent(i+1, len(pages), generatedAt, assetName, assetID, counts, columns, pageRows)

		writeObject(pageObjectNumber, fmt.Sprintf(
			"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 %d %d] /Resources << /Font << /%s 3 0 R /%s 4 0 R >> >> /Contents %d 0 R >>",
			reportPageWidth,
			reportPageHeight,
			reportFontRegular,
			reportFontBold,
			contentObjectNumber,
		))
		writeObject(contentObjectNumber, fmt.Sprintf("<< /Length %d >>\nstream\n%sendstream", len(content), content))
	}

	xrefOffset := buf.Len()
	write(fmt.Sprintf("xref\n0 %d\n", totalObjects+1))
	write("0000000000 65535 f \n")
	for i := 1; i <= totalObjects; i++ {
		write(fmt.Sprintf("%010d 00000 n \n", offsets[i]))
	}
	write(fmt.Sprintf("trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF", totalObjects+1, xrefOffset))

	return buf.Bytes(), nil
}

func buildReportBlocks(rows []CertificateReportRow) []reportBlock {
	if len(rows) == 0 {
		return []reportBlock{{
			lines: []reportLine{
				{font: reportFontBold, size: 11, text: "No certificates available.", r: 0.12, g: 0.12, b: 0.12},
			},
			height: 42,
		}}
	}

	blocks := make([]reportBlock, 0, len(rows))
	maxChars := 102

	for _, row := range rows {
		lines := make([]reportLine, 0, 8)
		statusR, statusG, statusB := statusColor(row.Status)

		for _, line := range wrapText(row.CertificateName, maxChars) {
			lines = append(lines, reportLine{font: reportFontBold, size: 11, text: line, r: 0.10, g: 0.10, b: 0.10})
		}

		lines = append(lines,
			reportLine{font: reportFontRegular, size: reportMetaFont, text: fmt.Sprintf("Certificate ID: %s", fallbackText(row.CertificateID)), r: 0.40, g: 0.40, b: 0.40},
			reportLine{font: reportFontRegular, size: reportBodyFont, text: fmt.Sprintf("Component: %s (%s)", fallbackText(row.ComponentName), fallbackText(row.ComponentID)), r: 0.15, g: 0.15, b: 0.15},
			reportLine{font: reportFontRegular, size: reportBodyFont, text: fmt.Sprintf("Asset: %s (%s)", fallbackText(row.AssetName), fallbackText(row.AssetID)), r: 0.15, g: 0.15, b: 0.15},
			reportLine{font: reportFontRegular, size: reportBodyFont, text: fmt.Sprintf("Issued By: %s", fallbackText(row.IssuingAuthority)), r: 0.15, g: 0.15, b: 0.15},
			reportLine{font: reportFontRegular, size: reportBodyFont, text: fmt.Sprintf("Last Inspection: %s    Next Inspection: %s", fallbackText(row.LastInspectionDate), fallbackText(row.NextInspectionDate)), r: 0.15, g: 0.15, b: 0.15},
			reportLine{font: reportFontBold, size: reportBodyFont, text: fmt.Sprintf("Status: %s", prettifyStatus(row.Status)), r: statusR, g: statusG, b: statusB},
		)

		height := reportBlockPad*2 + float64(len(lines))*reportLineGap
		blocks = append(blocks, reportBlock{lines: lines, height: height})
	}

	return blocks
}

func assetCertificateSheetColumns() []assetSheetColumn {
	return []assetSheetColumn{
		{label: "Component Name", width: 110, maxLines: 3, value: func(row AssetCertificateSheetRow) string { return row.ComponentName }},
		{label: "Serial No.", width: 78, maxLines: 2, value: func(row AssetCertificateSheetRow) string { return row.ComponentSerialNumber }},
		{label: "Certificate No.", width: 82, maxLines: 2, value: func(row AssetCertificateSheetRow) string { return row.CertificateNumber }},
		{label: "Issue Date", width: 66, maxLines: 1, value: func(row AssetCertificateSheetRow) string { return row.IssueDate }},
		{label: "Expiry Date", width: 66, maxLines: 1, value: func(row AssetCertificateSheetRow) string { return row.ExpiryDate }},
		{label: "IMCA D018 Details", width: 178, maxLines: 8, value: func(row AssetCertificateSheetRow) string { return row.IMCAD018Details }},
		{label: "Type of Test", width: 104, maxLines: 3, value: func(row AssetCertificateSheetRow) string { return row.TestType }},
		{label: "Status / Alert", width: 86, maxLines: 2, value: func(row AssetCertificateSheetRow) string { return assetSheetStatusLabel(row.Status) }},
	}
}

func buildAssetSheetRows(rows []AssetCertificateSheetRow, columns []assetSheetColumn) []assetSheetRenderedRow {
	if len(rows) == 0 {
		rows = []AssetCertificateSheetRow{{
			ComponentName: "No components found for this asset.",
			Status:        "NO_CERTIFICATE",
		}}
	}

	rendered := make([]assetSheetRenderedRow, 0, len(rows))
	for _, row := range rows {
		cells := make([][]string, 0, len(columns))
		maxLines := 1
		for _, column := range columns {
			maxChars := int((column.width - 8) / 3.8)
			if maxChars < 8 {
				maxChars = 8
			}
			lines := wrapTextWithLimit(column.value(row), maxChars, column.maxLines)
			if len(lines) > maxLines {
				maxLines = len(lines)
			}
			cells = append(cells, lines)
		}

		height := 24.0
		contentHeight := 8 + float64(maxLines)*9.5
		if contentHeight > height {
			height = contentHeight
		}
		rendered = append(rendered, assetSheetRenderedRow{cells: cells, source: row, height: height})
	}

	return rendered
}

func paginateAssetSheetRows(rows []assetSheetRenderedRow) [][]assetSheetRenderedRow {
	availableHeight := float64(reportPageHeight-reportMarginTop-reportMarginBottom) - 118
	pages := make([][]assetSheetRenderedRow, 0, 1)
	current := make([]assetSheetRenderedRow, 0)
	used := 0.0

	for _, row := range rows {
		if len(current) > 0 && used+row.height > availableHeight {
			pages = append(pages, current)
			current = make([]assetSheetRenderedRow, 0)
			used = 0
		}
		current = append(current, row)
		used += row.height
	}

	if len(current) == 0 {
		current = append(current, assetSheetRenderedRow{
			cells:  [][]string{{"No components found for this asset."}},
			height: 24,
		})
	}

	pages = append(pages, current)
	return pages
}

func paginateReportBlocks(blocks []reportBlock) [][]reportBlock {
	availableHeight := float64(reportPageHeight-reportMarginTop-reportMarginBottom) - reportHeaderGap
	pages := make([][]reportBlock, 0, 1)
	current := make([]reportBlock, 0)
	used := 0.0

	for _, block := range blocks {
		needed := block.height
		if len(current) > 0 {
			needed += 10
		}

		if len(current) > 0 && used+needed > availableHeight {
			pages = append(pages, current)
			current = make([]reportBlock, 0)
			used = 0
		}

		if len(current) > 0 {
			used += 10
		}
		current = append(current, block)
		used += block.height
	}

	if len(current) == 0 {
		current = append(current, reportBlock{
			lines:  []reportLine{{font: reportFontBold, size: 11, text: "No certificates available.", r: 0.12, g: 0.12, b: 0.12}},
			height: 42,
		})
	}

	pages = append(pages, current)
	return pages
}

func calculateReportCounts(rows []CertificateReportRow) reportCounts {
	counts := reportCounts{total: len(rows)}
	for _, row := range rows {
		switch strings.ToUpper(strings.TrimSpace(row.Status)) {
		case "VALID":
			counts.valid++
		case "EXPIRING_SOON":
			counts.expiring++
		case "EXPIRED":
			counts.expired++
		}
	}
	return counts
}

func calculateAssetSheetCounts(rows []AssetCertificateSheetRow) reportCounts {
	counts := reportCounts{total: len(rows)}
	for _, row := range rows {
		switch strings.ToUpper(strings.TrimSpace(row.Status)) {
		case "VALID":
			counts.valid++
		case "EXPIRING_SOON":
			counts.expiring++
		case "EXPIRED":
			counts.expired++
		}
	}
	return counts
}

func buildReportPageContent(pageNumber, pageCount int, generatedAt time.Time, counts reportCounts, blocks []reportBlock) string {
	var content strings.Builder

	topY := float64(reportPageHeight - reportMarginTop)
	writeText(&content, reportFontBold, 18, float64(reportMarginLeft), topY, 0.10, 0.10, 0.10, "AMS Certificate Report")
	writeText(&content, reportFontRegular, 10, float64(reportMarginLeft), topY-18, 0.25, 0.25, 0.25, fmt.Sprintf("Generated: %s", generatedAt.Format("02 Jan 2006 15:04")))
	writeText(&content, reportFontRegular, 9, float64(reportMarginLeft), topY-31, 0.35, 0.35, 0.35, " ")
	writeText(&content, reportFontBold, 10, float64(reportPageWidth-reportMarginRight-84), topY, 0.10, 0.10, 0.10, fmt.Sprintf("Page %d/%d", pageNumber, pageCount))

	summary := fmt.Sprintf("Total: %d   Valid: %d   Expiring Soon: %d   Expired: %d", counts.total, counts.valid, counts.expiring, counts.expired)
	fillRect(&content, float64(reportMarginLeft), topY-64, float64(reportContentWidth), 24, 0.95, 0.95, 0.95)
	strokeRect(&content, float64(reportMarginLeft), topY-64, float64(reportContentWidth), 24, 0.72, 0.72, 0.72)
	writeText(&content, reportFontBold, 10, float64(reportMarginLeft+10), topY-55, 0.15, 0.15, 0.15, summary)

	currentTop := topY - reportHeaderGap
	for _, block := range blocks {
		bottomY := currentTop - block.height
		fillRect(&content, float64(reportMarginLeft), bottomY, float64(reportContentWidth), block.height, 0.985, 0.985, 0.985)
		strokeRect(&content, float64(reportMarginLeft), bottomY, float64(reportContentWidth), block.height, 0.82, 0.82, 0.82)

		textY := currentTop - reportBlockPad - 2
		for _, line := range block.lines {
			writeText(&content, line.font, line.size, float64(reportMarginLeft)+12, textY, line.r, line.g, line.b, line.text)
			textY -= reportLineGap
		}

		currentTop = bottomY - 10
	}

	writeText(&content, reportFontRegular, 8, float64(reportMarginLeft), float64(reportMarginBottom), 0.40, 0.40, 0.40, "Generated from the live AMS certificate register.")
	return content.String()
}

func buildAssetSheetPageContent(pageNumber, pageCount int, generatedAt time.Time, assetName, assetID string, counts reportCounts, columns []assetSheetColumn, rows []assetSheetRenderedRow) string {
	var content strings.Builder

	topY := float64(reportPageHeight - reportMarginTop)
	writeText(&content, reportFontBold, 17, float64(reportMarginLeft), topY, 0.10, 0.10, 0.10, "Asset Component Certificate Sheet")
	writeText(&content, reportFontRegular, 10, float64(reportMarginLeft), topY-18, 0.25, 0.25, 0.25, fmt.Sprintf("Asset: %s (%s)", fallbackText(assetName), fallbackText(assetID)))
	writeText(&content, reportFontRegular, 9, float64(reportMarginLeft), topY-32, 0.35, 0.35, 0.35, fmt.Sprintf("Generated: %s", generatedAt.Format("02 Jan 2006 15:04")))
	writeText(&content, reportFontBold, 10, float64(reportPageWidth-reportMarginRight-84), topY, 0.10, 0.10, 0.10, fmt.Sprintf("Page %d/%d", pageNumber, pageCount))

	summary := fmt.Sprintf("Rows: %d   OK: %d   Expiring Soon: %d   Expired: %d", counts.total, counts.valid, counts.expiring, counts.expired)
	fillRect(&content, float64(reportMarginLeft), topY-66, float64(reportContentWidth), 24, 0.95, 0.95, 0.95)
	strokeRect(&content, float64(reportMarginLeft), topY-66, float64(reportContentWidth), 24, 0.72, 0.72, 0.72)
	writeText(&content, reportFontBold, 10, float64(reportMarginLeft+10), topY-57, 0.15, 0.15, 0.15, summary)

	tableTop := topY - 92
	headerHeight := 22.0
	x := float64(reportMarginLeft)
	for _, column := range columns {
		fillRect(&content, x, tableTop-headerHeight, column.width, headerHeight, 0.90, 0.91, 0.93)
		strokeRect(&content, x, tableTop-headerHeight, column.width, headerHeight, 0.66, 0.68, 0.72)
		headerLines := wrapTextWithLimit(column.label, int((column.width-8)/3.9), 2)
		textY := tableTop - 9
		for _, line := range headerLines {
			writeText(&content, reportFontBold, 7.5, x+4, textY, 0.10, 0.12, 0.16, line)
			textY -= 8.5
		}
		x += column.width
	}

	currentTop := tableTop - headerHeight
	for _, row := range rows {
		rowBottom := currentTop - row.height
		x = float64(reportMarginLeft)
		for columnIndex, column := range columns {
			fillR, fillG, fillB := 0.995, 0.995, 0.995
			if columnIndex == len(columns)-1 {
				fillR, fillG, fillB = statusBackgroundColor(row.source.Status)
			}
			fillRect(&content, x, rowBottom, column.width, row.height, fillR, fillG, fillB)
			strokeRect(&content, x, rowBottom, column.width, row.height, 0.80, 0.80, 0.80)

			lines := []string{"-"}
			if columnIndex < len(row.cells) {
				lines = row.cells[columnIndex]
			}
			textR, textG, textB := 0.14, 0.14, 0.14
			font := reportFontRegular
			if columnIndex == len(columns)-1 {
				textR, textG, textB = statusColor(row.source.Status)
				font = reportFontBold
			}
			textY := currentTop - 10
			for _, line := range lines {
				writeText(&content, font, 7.2, x+4, textY, textR, textG, textB, line)
				textY -= 9.5
			}
			x += column.width
		}
		currentTop = rowBottom
	}

	writeText(&content, reportFontRegular, 8, float64(reportMarginLeft), float64(reportMarginBottom), 0.40, 0.40, 0.40, "Generated from the live AMS asset certificate register.")
	return content.String()
}

func wrapText(value string, maxChars int) []string {
	value = strings.TrimSpace(strings.ReplaceAll(strings.ReplaceAll(value, "\r", " "), "\n", " "))
	if value == "" {
		return []string{"-"}
	}

	words := strings.Fields(value)
	if len(words) == 0 {
		return []string{"-"}
	}

	lines := make([]string, 0, 2)
	current := words[0]

	for _, word := range words[1:] {
		if len([]rune(current))+1+len([]rune(word)) <= maxChars {
			current += " " + word
			continue
		}
		lines = append(lines, current)
		current = word
	}

	lines = append(lines, current)
	return lines
}

func wrapTextWithLimit(value string, maxChars, maxLines int) []string {
	lines := wrapText(value, maxChars)
	if maxLines <= 0 || len(lines) <= maxLines {
		return lines
	}

	truncated := append([]string(nil), lines[:maxLines]...)
	last := truncated[len(truncated)-1]
	if len([]rune(last)) > 3 {
		truncated[len(truncated)-1] = strings.TrimSpace(string([]rune(last)[:len([]rune(last))-3])) + "..."
	} else {
		truncated[len(truncated)-1] = "..."
	}
	return truncated
}

func fallbackText(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return "-"
	}
	return value
}

func prettifyStatus(status string) string {
	switch strings.ToUpper(strings.TrimSpace(status)) {
	case "EXPIRING_SOON":
		return "Expiring Soon"
	case "EXPIRED":
		return "Expired"
	case "VALID":
		return "Valid"
	default:
		return fallbackText(status)
	}
}

func assetSheetStatusLabel(status string) string {
	switch strings.ToUpper(strings.TrimSpace(status)) {
	case "VALID":
		return "OK"
	case "EXPIRING_SOON":
		return "Expiring Soon"
	case "EXPIRED":
		return "Expired"
	case "PENDING":
		return "Pending"
	case "NO_CERTIFICATE":
		return "No Certificate"
	default:
		return fallbackText(status)
	}
}

func statusColor(status string) (float64, float64, float64) {
	switch strings.ToUpper(strings.TrimSpace(status)) {
	case "EXPIRED":
		return 0.67, 0.16, 0.16
	case "EXPIRING_SOON":
		return 0.70, 0.40, 0.05
	case "PENDING", "NO_CERTIFICATE":
		return 0.34, 0.36, 0.40
	default:
		return 0.12, 0.47, 0.22
	}
}

func statusBackgroundColor(status string) (float64, float64, float64) {
	switch strings.ToUpper(strings.TrimSpace(status)) {
	case "EXPIRED":
		return 0.99, 0.92, 0.92
	case "EXPIRING_SOON":
		return 1.00, 0.96, 0.88
	case "VALID":
		return 0.92, 0.97, 0.93
	default:
		return 0.95, 0.95, 0.96
	}
}

func fillRect(content *strings.Builder, x, y, width, height, r, g, b float64) {
	content.WriteString(fmt.Sprintf("%.3f %.3f %.3f rg %.2f %.2f %.2f %.2f re f\n", r, g, b, x, y, width, height))
}

func strokeRect(content *strings.Builder, x, y, width, height, r, g, b float64) {
	content.WriteString(fmt.Sprintf("%.3f %.3f %.3f RG %.2f %.2f %.2f %.2f re S\n", r, g, b, x, y, width, height))
}

func writeText(content *strings.Builder, font string, size, x, y, r, g, b float64, text string) {
	content.WriteString(fmt.Sprintf(
		"BT /%s %.2f Tf %.3f %.3f %.3f rg 1 0 0 1 %.2f %.2f Tm (%s) Tj ET\n",
		font,
		size,
		r,
		g,
		b,
		x,
		y,
		escapePDFText(text),
	))
}

func escapePDFText(value string) string {
	value = strings.ReplaceAll(value, "\\", "\\\\")
	value = strings.ReplaceAll(value, "(", "\\(")
	value = strings.ReplaceAll(value, ")", "\\)")

	var cleaned strings.Builder
	for _, r := range value {
		if r == '\n' || r == '\r' || r == '\t' {
			cleaned.WriteByte(' ')
			continue
		}
		if r < 32 || r > 126 {
			cleaned.WriteByte('?')
			continue
		}
		cleaned.WriteRune(r)
	}

	return cleaned.String()
}
