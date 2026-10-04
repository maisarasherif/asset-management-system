package certificateissuance

import (
	"bytes"
	"context"
	_ "embed"
	"fmt"
	"image"
	_ "image/png"
	"math"
	"strings"
	"time"

	"github.com/signintech/gopdf"
)

//go:embed assets/NotoSans-Regular.ttf
var regularFont []byte

//go:embed assets/NotoSans-Bold.ttf
var boldFont []byte

//go:embed assets/porto-marine-logo.png
var companyLogo []byte

type PDFRenderer struct{}

const pdfMargin = 40.0
const pdfWidth = 515.0
const pdfBottom = 765.0
const pdfLogoTop = 30.0
const pdfLogoRuleGap = 10.0

type certificatePDF struct {
	pdf          gopdf.GoPdf
	ctx          context.Context
	number       string
	y            float64
	bodyTop      float64
	err          error
	missingGlyph bool
	logo         gopdf.ImageHolder
	logoHeight   float64
}

func (r *certificatePDF) font(bold bool, size float64) {
	name := "Noto"
	if bold {
		name = "NotoBold"
	}
	if r.err == nil {
		r.err = r.pdf.SetFont(name, "", size)
	}
}
func (r *certificatePDF) text(x, y, width, size float64, bold bool, text string, align int) {
	r.font(bold, size)
	r.pdf.SetXY(x, y)
	if r.err == nil {
		r.err = r.pdf.CellWithOption(&gopdf.Rect{W: width, H: size + 4}, text, gopdf.CellOption{Align: align})
	}
	if r.missingGlyph {
		r.err = ErrPreviewText
	}
}
func (r *certificatePDF) lines(text string, width, size float64, bold bool) []string {
	r.font(bold, size)
	if r.err != nil {
		return nil
	}
	text = strings.ReplaceAll(strings.ReplaceAll(strings.ReplaceAll(text, "\r\n", "\n"), "\r", "\n"), "\t", "    ")
	result := []string{}
	for _, paragraph := range strings.Split(text, "\n") {
		if paragraph == "" {
			result = append(result, "")
			continue
		}
		lines, err := r.pdf.SplitTextWithWordWrap(paragraph, width)
		if err != nil {
			r.err = err
			return nil
		}
		result = append(result, lines...)
	}
	if r.missingGlyph {
		r.err = ErrPreviewText
	}
	return result
}
func (r *certificatePDF) page() {
	if r.err != nil {
		return
	}
	if err := r.ctx.Err(); err != nil {
		r.err = err
		return
	}
	if r.pdf.GetNumberOfPages() >= 40 {
		r.err = ErrPreviewInput
		return
	}
	r.pdf.AddPage()
	if err := r.pdf.ImageByHolder(r.logo, pdfMargin, pdfLogoTop, &gopdf.Rect{W: 115, H: r.logoHeight}); err != nil {
		r.err = err
		return
	}
	r.pdf.SetStrokeColor(70, 181, 179)
	r.pdf.SetLineWidth(1)
	ruleY := pdfLogoTop + r.logoHeight + pdfLogoRuleGap
	r.pdf.Line(pdfMargin, ruleY, pdfMargin+pdfWidth, ruleY)
	r.pdf.SetTextColor(45, 93, 153)
	// Keep the reviewed spacing below the header while allowing the title,
	// number, and body to follow the logo/line position on every page.
	titleY := ruleY + 16
	numberY := titleY + 32
	r.text(pdfMargin, titleY, pdfWidth, 18, true, "CERTIFICATE OF EXAMINATION", gopdf.Center)
	numberLines := r.lines(r.number, pdfWidth, 11, true)
	if len(numberLines) > 3 {
		r.err = ErrPreviewInput
		return
	}
	for i, line := range numberLines {
		r.text(pdfMargin, numberY+float64(i)*15, pdfWidth, 11, true, line, gopdf.Center)
	}
	r.pdf.SetTextColor(23, 44, 66)
	r.bodyTop = numberY + 27 + float64(max(0, len(numberLines)-1))*15
	r.y = r.bodyTop
}
func (r *certificatePDF) space(height float64) {
	if r.y+height > pdfBottom {
		r.page()
	}
}
func (r *certificatePDF) section(title string) {
	r.space(46)
	r.pdf.SetTextColor(45, 93, 153)
	r.text(pdfMargin, r.y, pdfWidth, 11, true, title, gopdf.Left)
	r.pdf.SetStrokeColor(70, 181, 179)
	r.pdf.Line(pdfMargin, r.y+20, pdfMargin+pdfWidth, r.y+20)
	r.pdf.SetTextColor(23, 44, 66)
	r.y += 29
}
func (r *certificatePDF) field(label, value string) {
	lines := r.lines(value, pdfWidth-20, 10, false)
	if len(lines) == 0 {
		lines = []string{"—"}
	}
	r.space(40)
	r.pdf.SetTextColor(96, 112, 128)
	r.text(pdfMargin+10, r.y, pdfWidth-20, 8, true, label, gopdf.Left)
	r.y += 14
	r.pdf.SetTextColor(23, 44, 66)
	for _, line := range lines {
		if r.y+14 > pdfBottom {
			r.page()
			r.text(pdfMargin+10, r.y, pdfWidth-20, 8, true, label+" (continued)", gopdf.Left)
			r.y += 14
		}
		r.text(pdfMargin+10, r.y, pdfWidth-20, 10, false, line, gopdf.Left)
		r.y += 14
	}
	r.y += 8
}
func (r *certificatePDF) row(leftLabel, leftValue, rightLabel, rightValue string) {
	left := r.lines(leftValue, 237, 10, false)
	right := r.lines(rightValue, 237, 10, false)
	if len(left) == 0 {
		left = []string{"—"}
	}
	if len(right) == 0 {
		right = []string{"—"}
	}
	count := max(len(left), len(right))
	offset := 0
	for offset < count {
		r.space(42)
		room := int((pdfBottom - r.y - 22) / 14)
		room = max(room, 1)
		length := min(room, count-offset)
		height := 22 + float64(length)*14
		r.pdf.SetFillColor(244, 247, 250)
		r.pdf.SetStrokeColor(215, 224, 232)
		r.pdf.RectFromUpperLeftWithStyle(pdfMargin, r.y, pdfWidth, height, "DF")
		for col, label := range []string{leftLabel, rightLabel} {
			x := pdfMargin + 10 + float64(col)*257
			r.pdf.SetTextColor(96, 112, 128)
			r.text(x, r.y+3, 237, 8, true, label, gopdf.Left)
			r.pdf.SetTextColor(23, 44, 66)
			values := left
			if col == 1 {
				values = right
			}
			for i := 0; i < length; i++ {
				if offset+i < len(values) {
					r.text(x, r.y+17+float64(i)*14, 237, 10, false, values[offset+i], gopdf.Left)
				}
			}
		}
		offset += length
		r.y += height + 6
	}
}

func (PDFRenderer) Render(ctx context.Context, s Snapshot, number string, signature []byte) ([]byte, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	// The caller verifies stored signature integrity before rendering. Convert
	// legacy 16-bit PNGs in memory without changing the immutable R2 object.
	signature, signatureSize, err := signatureForPDF(signature)
	if err != nil {
		return nil, err
	}
	r := &certificatePDF{ctx: ctx, number: number}
	r.pdf.Start(gopdf.Config{PageSize: *gopdf.PageSizeA4})
	option := gopdf.TtfOption{OnGlyphNotFound: func(rune) { r.missingGlyph = true }}
	if err := r.pdf.AddTTFFontDataWithOption("Noto", regularFont, option); err != nil {
		return nil, err
	}
	if err := r.pdf.AddTTFFontDataWithOption("NotoBold", boldFont, option); err != nil {
		return nil, err
	}
	logo, err := gopdf.ImageHolderByBytes(companyLogo)
	if err != nil {
		return nil, err
	}
	r.logo = logo
	logoSize, _, err := image.DecodeConfig(bytes.NewReader(companyLogo))
	if err != nil {
		return nil, err
	}
	r.logoHeight = 115 * float64(logoSize.Height) / float64(logoSize.Width)
	r.pdf.SetInfo(gopdf.PdfInfo{Title: "CERTIFICATE OF EXAMINATION", Author: "Porto Marine Services L.L.C."})
	r.page()
	if r.err != nil {
		return nil, r.err
	}
	date := func(value string) string {
		if value == "" {
			return "No expiry"
		}
		d, _ := time.Parse("2006-01-02", value)
		return d.Format("02 Jan 2006")
	}
	r.row("ISSUE DATE", date(s.IssueDate), "EXPIRY DATE", date(s.ExpiryDate))
	r.section("Equipment & Component")
	r.row("EQUIPMENT", s.EquipmentName, "COMPONENT", s.ComponentName)
	r.row("SERIAL NUMBER", s.SerialNumber, "LOCATION", s.Location)
	r.row("VALIDITY PERIOD", s.ValidityPeriod, "", "")
	r.section("Test details & References")
	r.row("TEST TYPE", s.TestName, "IMCA REFERENCE", s.IMCARef)
	if s.TestDescription != "" {
		r.field("TEST DESCRIPTION", s.TestDescription)
	}
	if s.IMCAD018 != "" {
		r.field("IMCA D018", s.IMCAD018)
	}
	if strings.TrimSpace(s.Remarks) != "" || strings.TrimSpace(s.Measurements) != "" {
		r.section("Test remarks & measurements")
		if strings.TrimSpace(s.Remarks) != "" {
			r.field("REMARKS", s.Remarks)
		}
		if strings.TrimSpace(s.Measurements) != "" {
			r.field("MEASUREMENTS", s.Measurements)
		}
	}
	// Keep the signer metadata and proportionally scaled image on one page.
	nameLines := r.lines(s.Signer.FullName, 237, 10, false)
	orgLines := r.lines(s.Signer.Organization, 237, 10, false)
	height := math.Max(112, 74+float64(len(nameLines)+len(orgLines))*15)
	if height+40 > pdfBottom-r.bodyTop {
		return nil, ErrPreviewInput
	}
	r.space(height + 29)
	r.section("Competent person")
	start := r.y
	r.pdf.SetStrokeColor(215, 224, 232)
	r.pdf.RectFromUpperLeftWithStyle(pdfMargin, start, pdfWidth, height, "D")
	r.text(pdfMargin+10, start+8, 237, 8, true, "NAME", gopdf.Left)
	y := start + 24
	for _, line := range nameLines {
		r.text(pdfMargin+10, y, 237, 10, false, line, gopdf.Left)
		y += 15
	}
	r.text(pdfMargin+10, y+3, 237, 8, true, "ORGANIZATION", gopdf.Left)
	y += 19
	for _, line := range orgLines {
		r.text(pdfMargin+10, y, 237, 10, false, line, gopdf.Left)
		y += 15
	}
	r.text(pdfMargin+10, y+3, 237, 8, true, "DATE", gopdf.Left)
	r.text(pdfMargin+10, y+19, 237, 10, false, date(s.IssueDate), gopdf.Left)
	r.text(pdfMargin+277, start+8, 218, 8, true, "SIGNATURE / STAMP", gopdf.Left)
	holder, err := gopdf.ImageHolderByBytes(signature)
	if err != nil {
		return nil, err
	}
	scale := math.Min(205/float64(signatureSize.Width), 68/float64(signatureSize.Height))
	w, h := float64(signatureSize.Width)*scale, float64(signatureSize.Height)*scale
	if r.err == nil {
		r.err = r.pdf.ImageByHolder(holder, pdfMargin+277+(205-w)/2, start+34+(68-h)/2, &gopdf.Rect{W: w, H: h})
	}
	pages := r.pdf.GetNumberOfPages()
	for page := 1; page <= pages; page++ {
		if r.err != nil {
			break
		}
		r.err = r.pdf.SetPage(page)
		r.pdf.SetTextColor(45, 93, 153)
		r.pdf.SetStrokeColor(215, 224, 232)
		r.pdf.Line(pdfMargin, 780, pdfMargin+pdfWidth, 780)
		r.text(pdfMargin, 790, pdfWidth, 9, true, "Porto Marine Services L.L.C.", gopdf.Center)
		r.text(pdfMargin, 808, pdfWidth, 8, false, "www.portomarines.com", gopdf.Center)
		r.text(pdfMargin, 792, pdfWidth, 7, false, fmt.Sprintf("Page %d of %d", page, pages), gopdf.Right)
	}
	if r.err != nil {
		return nil, r.err
	}
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	var output bytes.Buffer
	if _, err := r.pdf.WriteTo(&output); err != nil {
		return nil, err
	}
	return output.Bytes(), nil
}
