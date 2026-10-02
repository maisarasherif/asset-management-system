"""Disposable certificate layout proposal; ReportLab mockup, not production gopdf code.

Run with the bundled Python after rendering the existing SVG logo to tmp/pdfs/logo.png.
Synthetic records only. Human approved this revised layout on 2 October 2026.
"""
from pathlib import Path
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4
from reportlab.lib.colors import HexColor, Color
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Paragraph
from reportlab.lib.styles import ParagraphStyle

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / 'output/pdf/certificate-layout-proposal.pdf'
OUT.parent.mkdir(parents=True, exist_ok=True)
FONT_DIR = Path(r'C:/Users/maisa/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/poppler/Library/share/fonts')
pdfmetrics.registerFont(TTFont('Proposal', str(FONT_DIR / 'Ubuntu-R.ttf')))
pdfmetrics.registerFont(TTFont('ProposalBold', str(FONT_DIR / 'Ubuntu-B.ttf')))

W, H = A4
M = 40
RIGHT = W - M
WIDTH = RIGHT - M
BLUE = HexColor('#2d5d99')
TEAL = HexColor('#46b5b3')
INK = HexColor('#172c42')
MUTED = HexColor('#607080')
LINE = HexColor('#d7e0e8')
WASH = HexColor('#f4f7fa')
c = canvas.Canvas(str(OUT), pagesize=A4)
c.setTitle('Generated certificate - layout proposal')
c.setAuthor('Porto Marine Services - design proposal')
c.setSubject('Synthetic layout sample for human review; not an issued certificate')

def text(x, y, value, size=10, bold=False, color=INK, align='left'):
    c.setFont('ProposalBold' if bold else 'Proposal', size)
    c.setFillColor(color)
    if align == 'right':
        c.drawRightString(x, y, value)
    elif align == 'center':
        c.drawCentredString(x, y, value)
    else:
        c.drawString(x, y, value)

def rect(x, y, width, height, fill=None, stroke=LINE):
    c.setStrokeColor(stroke)
    c.setLineWidth(.6)
    if fill:
        c.setFillColor(fill)
    c.rect(x, y, width, height, fill=bool(fill), stroke=1)

def paragraph(x, top, content, width, size=10, color=INK, leading=14):
    style = ParagraphStyle('sample', fontName='Proposal', fontSize=size,
                           leading=leading, textColor=color)
    p = Paragraph(content, style)
    _, height = p.wrap(width, H)
    p.drawOn(c, x, top - height)
    return height

def section(y, name):
    text(M, y, name.upper(), 10.5, True, BLUE)
    c.setStrokeColor(LINE)
    c.setLineWidth(.6)
    c.line(M, y - 8, RIGHT, y - 8)

def cell(x, top, label, value):
    text(x, top, label.upper(), 7.2, color=MUTED)
    text(x, top - 14, value, 10, True)

# Smaller logo in the header; the certificate title begins the centered body.
c.drawImage(str(ROOT / 'tmp/pdfs/logo.png'), M, 783, width=154,
            height=33.1, preserveAspectRatio=True, mask='auto')
c.setStrokeColor(TEAL)
c.setLineWidth(2)
c.line(M, 771, RIGHT, 771)
text(W / 2, 744, 'CERTIFICATE OF EXAMINATION', 16, True, BLUE, 'center')

# The same final layout is used in preview; XX is the provisional sequence.
rect(M, 670, WIDTH, 61, WASH)
cell(M + 14, 714, 'Certificate number', 'PMS-CE-261002-042-PG-XX')
cell(333, 714, 'Issue date', '02 Oct 2026')
cell(446, 714, 'Expiry date', '02 Oct 2027')

section(643, 'Equipment & component')
left, right = M + 13, M + WIDTH / 2 + 14
rect(M, 525, WIDTH, 100)
rows = [
    ('Equipment', 'Diving control panel', 'Component', 'Pressure gauge'),
    ('Serial number', 'PG-DEMO-042', 'Location', 'Workshop bay 2'),
]
for i, (a, b, d, e) in enumerate(rows):
    y = 608 - i * 30
    cell(left, y, a, b)
    cell(right, y, d, e)
cell(left, 548, 'Validity period', '12 months')

section(500, 'Test details & references')
rect(M, 411, WIDTH, 71)
cell(left, 465, 'Test type', 'Pressure test')
cell(right, 465, 'IMCA reference', 'Example record reference')
cell(left, 434, 'Test description', 'Pressure verification of the component')
cell(right, 434, 'IMCA D018 reference', 'Example catalogue item')

section(383, 'Test remarks & measurements')
text(M, 361, 'REMARKS', 7.2, color=MUTED)
paragraph(M, 349,
          'Visual examination and pressure verification completed for the component '
          'identified above. Recorded observations relate to this test only.', WIDTH)
text(M, 302, 'MEASUREMENTS', 7.2, color=MUTED)
paragraph(M, 290, 'Applied pressure: 10 bar. Hold time: 5 minutes.', WIDTH)

section(240, 'Competent person')
rect(M, 109, WIDTH, 112)
cell(left, 203, 'Name', 'Sample Competent Person')
cell(left, 171, 'Organization', 'Porto Marine Services')
cell(left, 139, 'Date', '02 Oct 2026')
text(336, 203, 'SIGNATURE / STAMP', 7.2, color=MUTED)
rect(335, 121, 205, 68, HexColor('#f7fbfb'))
text(437.5, 153, 'Saved signature / stamp image', 9, color=MUTED, align='center')

# Company footer; the synthetic-data label belongs to the review artifact only.
c.setStrokeColor(LINE)
c.line(M, 65, RIGHT, 65)
text(W / 2, 48, 'Porto Marine Services L.L.C.', 9, True, BLUE, 'center')
text(W / 2, 34, 'www.portomarines.com', 8.5, color=BLUE, align='center')
text(RIGHT, 48, 'Page 1 of 1', 7, color=MUTED, align='right')
text(W / 2, 17, 'LAYOUT PROPOSAL - SYNTHETIC SAMPLE DATA - NOT AN ISSUED CERTIFICATE',
     6.2, color=MUTED, align='center')
c.showPage()
c.save()
print(OUT)
