const fs = require("fs");
const path = require("path");
const {
  Document, Packer, Paragraph, TextRun, ImageRun,
  Header, Footer, AlignmentType, HeadingLevel,
  PageBreak, PageNumber, TableOfContents,
  BorderStyle
} = require("docx");

const BASE = path.resolve(__dirname, "..");
const mdPath = path.join(BASE, "drafts", "Conscience_is_All_You_Need_v2.md");
const outPath = path.join(BASE, "output", "Conscience_is_All_You_Need_v2.docx");
const figDir = path.join(BASE, "figures");

// Read markdown
const md = fs.readFileSync(mdPath, "utf-8");
const lines = md.split(/\r?\n/);

// Figure insertion map: after which heading marker do we insert which figure
const figureInsertions = {
  "### 4.3 Principle 3": {
    file: "fig1_conscience_architecture.png",
    caption: "Figure 1. Conscience Faculty Architecture. System 1 filtering runs continuously; System 2 moral reasoning is triggered only when the disposition layer detects tension, exploiting the sparsity of tool calls for deep deliberation without prohibitive latency."
  },
  "### 4.3": {  // fallback
    file: "fig1_conscience_architecture.png",
    caption: "Figure 1. Conscience Faculty Architecture."
  }
};

// Helper: parse inline formatting (bold, italic)
function parseInline(text) {
  const runs = [];
  // Split on bold (**...**) and italic (*...* but not **)
  const regex = /(\*\*\*(.+?)\*\*\*|\*\*(.+?)\*\*|\*(.+?)\*|([^*]+))/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    if (match[2]) {
      runs.push(new TextRun({ text: match[2], bold: true, italics: true, font: "Arial", size: 24 }));
    } else if (match[3]) {
      runs.push(new TextRun({ text: match[3], bold: true, font: "Arial", size: 24 }));
    } else if (match[4]) {
      runs.push(new TextRun({ text: match[4], italics: true, font: "Arial", size: 24 }));
    } else if (match[5]) {
      runs.push(new TextRun({ text: match[5], font: "Arial", size: 24 }));
    }
  }
  return runs.length > 0 ? runs : [new TextRun({ text, font: "Arial", size: 24 })];
}

// Build document children
const children = [];

// ---- Title Page ----
children.push(new Paragraph({ spacing: { before: 4000 }, children: [] }));
children.push(new Paragraph({
  alignment: AlignmentType.CENTER,
  spacing: { after: 200 },
  children: [new TextRun({ text: "Conscience is All You Need", font: "Arial", size: 48, bold: true })]
}));
children.push(new Paragraph({
  alignment: AlignmentType.CENTER,
  spacing: { after: 100 },
  children: [new TextRun({ text: "Toward a Virtue-Ethics Architecture for Agentic AI Safety", font: "Arial", size: 28, italics: true, color: "555555" })]
}));
children.push(new Paragraph({ spacing: { after: 600 }, children: [] }));
children.push(new Paragraph({
  alignment: AlignmentType.CENTER,
  spacing: { after: 80 },
  children: [new TextRun({ text: "Leo Linbeck III", font: "Arial", size: 28, bold: true })]
}));
children.push(new Paragraph({
  alignment: AlignmentType.CENTER,
  spacing: { after: 80 },
  children: [new TextRun({ text: "Stanford Graduate School of Business", font: "Arial", size: 24 })]
}));
children.push(new Paragraph({
  alignment: AlignmentType.CENTER,
  spacing: { after: 200 },
  children: [new TextRun({ text: "leo3@linbeck.com", font: "Arial", size: 24, color: "2E75B6" })]
}));
children.push(new Paragraph({ spacing: { after: 1000 }, children: [] }));
children.push(new Paragraph({
  alignment: AlignmentType.CENTER,
  children: [new TextRun({ text: "March 2026", font: "Arial", size: 24 })]
}));
children.push(new Paragraph({ children: [new PageBreak()] }));

// ---- Table of Contents ----
children.push(new Paragraph({
  heading: HeadingLevel.HEADING_1,
  children: [new TextRun({ text: "Table of Contents", font: "Arial", size: 32, bold: true })]
}));
children.push(new TableOfContents("Table of Contents", { hyperlink: true, headingStyleRange: "1-3" }));
children.push(new Paragraph({ children: [new PageBreak()] }));

// ---- Parse Markdown Body ----
let skipHeader = true; // skip initial title/author lines
let inAbstract = false;
let figuresInserted = new Set();

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];

  // Skip the raw title block (first few lines before ## Abstract)
  if (skipHeader) {
    if (line.startsWith("## Abstract") || line.startsWith("## 1.")) {
      skipHeader = false;
    } else {
      continue;
    }
  }

  // Skip horizontal rules
  if (/^---\s*$/.test(line.trim())) continue;

  // Headings
  if (line.startsWith("### ")) {
    const text = line.replace(/^###\s+/, "").replace(/\*\*/g, "");
    children.push(new Paragraph({
      heading: HeadingLevel.HEADING_3,
      spacing: { before: 200, after: 100 },
      children: [new TextRun({ text, font: "Arial", size: 24, bold: true })]
    }));
    continue;
  }
  if (line.startsWith("## ")) {
    const text = line.replace(/^##\s+/, "").replace(/\*\*/g, "");
    // Page break before major sections (except Abstract)
    if (!text.includes("Abstract")) {
      children.push(new Paragraph({ children: [new PageBreak()] }));
    }
    children.push(new Paragraph({
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 300, after: 150 },
      children: [new TextRun({ text, font: "Arial", size: 28, bold: true })]
    }));
    continue;
  }
  if (line.startsWith("# ")) {
    const text = line.replace(/^#\s+/, "");
    children.push(new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 400, after: 200 },
      children: [new TextRun({ text, font: "Arial", size: 32, bold: true })]
    }));
    continue;
  }

  // Empty lines
  if (line.trim() === "") continue;

  // Keywords line
  if (line.startsWith("**Keywords:**")) {
    const text = line.replace(/\*\*/g, "");
    children.push(new Paragraph({
      spacing: { before: 200, after: 400 },
      children: [
        new TextRun({ text: "Keywords: ", font: "Arial", size: 24, bold: true }),
        new TextRun({ text: text.replace("Keywords: ", "").replace("Keywords:", ""), font: "Arial", size: 24, italics: true })
      ]
    }));
    continue;
  }

  // Regular paragraph
  const trimmed = line.trim();
  if (trimmed.length > 0) {
    children.push(new Paragraph({
      spacing: { after: 120, line: 360 }, // 1.5 line spacing
      children: parseInline(trimmed)
    }));
  }
}

// ---- Insert figures at end (as an appendix-style section) ----
children.push(new Paragraph({ children: [new PageBreak()] }));
children.push(new Paragraph({
  heading: HeadingLevel.HEADING_2,
  spacing: { before: 300, after: 200 },
  children: [new TextRun({ text: "Figures", font: "Arial", size: 28, bold: true })]
}));

const figures = [
  { file: "fig1_conscience_architecture.png", caption: "Figure 1. Conscience Faculty Architecture. System 1 filtering runs continuously; System 2 moral reasoning is triggered only when the disposition layer detects tension, exploiting the sparsity of tool calls for deep deliberation without prohibitive latency." },
  { file: "fig2_clarity_stakes.png", caption: "Figure 2. Clarity \u00D7 Stakes Scoring Matrix. The product of Clarity (1\u201310) and Stakes (1\u201310) maps to four graduated response tiers: Proceed (1\u201315), Note (16\u201335), Pause (36\u201360), and Escalate (61\u2013100)." },
  { file: "fig3_safety_stack.png", caption: "Figure 3. Three-Level Safety Stack. Subsidiarity governs the relationship between levels: the higher supports but does not supplant the lower. Synderesis provides the non-negotiable floor; conscientia provides adaptive judgment; communal norms provide emergent coordination." },
  { file: "fig4_comparison_table.png", caption: "Figure 4. Comparison of Top-Down Safety and Conscience Faculty approaches across seven dimensions." }
];

for (const fig of figures) {
  const figPath = path.join(figDir, fig.file);
  if (fs.existsSync(figPath)) {
    const imgData = fs.readFileSync(figPath);
    children.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 300 },
      children: [new ImageRun({
        type: "png",
        data: imgData,
        transformation: { width: 550, height: 400 },
        altText: { title: fig.file, description: fig.caption, name: fig.file }
      })]
    }));
    children.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 },
      children: [new TextRun({ text: fig.caption, font: "Arial", size: 20, italics: true })]
    }));
  }
}

// ---- Create Document ----
const doc = new Document({
  styles: {
    default: {
      document: { run: { font: "Arial", size: 24 } }
    },
    paragraphStyles: [
      {
        id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 32, bold: true, font: "Arial" },
        paragraph: { spacing: { before: 400, after: 200 }, outlineLevel: 0 }
      },
      {
        id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 28, bold: true, font: "Arial" },
        paragraph: { spacing: { before: 300, after: 150 }, outlineLevel: 1 }
      },
      {
        id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 24, bold: true, font: "Arial" },
        paragraph: { spacing: { before: 200, after: 100 }, outlineLevel: 2 }
      }
    ]
  },
  sections: [{
    properties: {
      page: {
        size: { width: 12240, height: 15840 },
        margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 }
      }
    },
    headers: {
      default: new Header({
        children: [new Paragraph({
          alignment: AlignmentType.RIGHT,
          children: [new TextRun({ text: "Conscience is All You Need \u2014 Linbeck", font: "Arial", size: 18, italics: true, color: "888888" })]
        })]
      })
    },
    footers: {
      default: new Footer({
        children: [new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({ text: "Page ", font: "Arial", size: 18 }),
            new TextRun({ children: [PageNumber.CURRENT], font: "Arial", size: 18 })
          ]
        })]
      })
    },
    children
  }]
});

// ---- Write ----
Packer.toBuffer(doc).then(buffer => {
  fs.writeFileSync(outPath, buffer);
  console.log("SUCCESS: " + outPath);
}).catch(err => {
  console.error("ERROR:", err.message);
  process.exit(1);
});
