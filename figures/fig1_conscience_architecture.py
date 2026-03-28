"""
Figure 1: Conscience Simulator Module Architecture (Dual-Process System)
Publication-quality flowchart for Philosophy & Technology (Springer)
"""
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch
import matplotlib.patheffects as pe
import numpy as np

# ── Publication styling ──────────────────────────────────────────────
plt.rcParams.update({
    'font.family': 'Arial',
    'font.size': 9,
    'axes.linewidth': 0.5,
    'figure.dpi': 300,
    'savefig.dpi': 300,
    'savefig.bbox': 'tight',
    'savefig.pad_inches': 0.15,
})

# ── Colorblind-safe palette (blue tones) ────────────────────────────
SYS1_BG      = '#B3D4F5'   # light blue
SYS1_BORDER  = '#4A90C4'
SYS2_BG      = '#8B7EC8'   # purple-blue
SYS2_BORDER  = '#5B4A9E'
GATE_BG      = '#D6CCF0'
DIAMOND_BG   = '#FFD580'   # amber for decision
TIER_COLORS  = ['#6AAF6A', '#C4C44A', '#E0943A', '#CC5555']  # green, yellow, orange, red
INPUT_BG     = '#E8E8E8'
OUTPUT_BG    = '#D0D0D0'
TEXT_DARK     = '#1A1A1A'

fig, ax = plt.subplots(figsize=(7.5, 10.5))
ax.set_xlim(0, 10)
ax.set_ylim(0, 14)
ax.axis('off')
fig.patch.set_facecolor('white')

def draw_box(ax, xy, w, h, text, fc, ec='#333333', lw=1.0, fontsize=9,
             fontweight='normal', alpha=1.0, text_color=TEXT_DARK, style='round,pad=0.15'):
    box = FancyBboxPatch(xy, w, h, boxstyle=style,
                         facecolor=fc, edgecolor=ec, linewidth=lw, alpha=alpha,
                         zorder=2)
    ax.add_patch(box)
    cx, cy = xy[0] + w / 2, xy[1] + h / 2
    ax.text(cx, cy, text, ha='center', va='center', fontsize=fontsize,
            fontweight=fontweight, color=text_color, zorder=3, wrap=True,
            multialignment='center')
    return box

def draw_diamond(ax, cx, cy, w, h, text, fc, ec='#333333', lw=1.0, fontsize=8.5):
    verts = [(cx, cy + h/2), (cx + w/2, cy), (cx, cy - h/2), (cx - w/2, cy), (cx, cy + h/2)]
    from matplotlib.patches import Polygon
    diamond = Polygon(verts, closed=True, facecolor=fc, edgecolor=ec, linewidth=lw, zorder=2)
    ax.add_patch(diamond)
    ax.text(cx, cy, text, ha='center', va='center', fontsize=fontsize,
            fontweight='bold', color=TEXT_DARK, zorder=3, multialignment='center')

def arrow(ax, x1, y1, x2, y2, color='#333333', lw=1.2, style='-|>'):
    ax.annotate('', xy=(x2, y2), xytext=(x1, y1),
                arrowprops=dict(arrowstyle=style, color=color, lw=lw, shrinkA=2, shrinkB=2),
                zorder=4)

def arrow_label(ax, x1, y1, x2, y2, label, color='#333333', lw=1.2, offset=(0, 0)):
    arrow(ax, x1, y1, x2, y2, color=color, lw=lw)
    mx, my = (x1 + x2) / 2 + offset[0], (y1 + y2) / 2 + offset[1]
    ax.text(mx, my, label, ha='center', va='center', fontsize=7.5,
            fontstyle='italic', color=color, zorder=5,
            bbox=dict(facecolor='white', edgecolor='none', alpha=0.85, pad=1))

# ── 1. Action Request (top) ─────────────────────────────────────────
draw_box(ax, (3.5, 13.0), 3, 0.6, 'Action Request', INPUT_BG, lw=1.2, fontsize=10, fontweight='bold')
arrow(ax, 5, 13.0, 5, 12.55)

# ── 2. System 1 region ──────────────────────────────────────────────
sys1_rect = FancyBboxPatch((1.2, 9.6), 7.6, 2.9, boxstyle='round,pad=0.2',
                           facecolor=SYS1_BG, edgecolor=SYS1_BORDER, linewidth=1.8,
                           alpha=0.35, zorder=1)
ax.add_patch(sys1_rect)
ax.text(1.6, 12.2, 'System 1', fontsize=11, fontweight='bold', color=SYS1_BORDER,
        fontstyle='italic', zorder=3)
ax.text(1.6, 11.85, '(lightweight, continuous)', fontsize=7.5, color=SYS1_BORDER, zorder=3)

# Monitor boxes
monitors = [
    (1.5, 10.1, 2.2, 0.7, 'Provenance\nTracking'),
    (4.0, 10.1, 2.2, 0.7, 'Coherence\nMonitoring'),
    (6.5, 10.1, 2.2, 0.7, 'Affective Pressure\nSensing'),
]
for (x, y, w, h, txt) in monitors:
    draw_box(ax, (x, y), w, h, txt, SYS1_BG, ec=SYS1_BORDER, lw=1.0, fontsize=8)

# arrows from monitors down to merge
for (x, y, w, h, _) in monitors:
    arrow(ax, x + w/2, y, x + w/2, 9.45, color=SYS1_BORDER, lw=0.8)

# merge into diamond
arrow(ax, 5, 11.15, 5, 10.8)  # from label area to monitors
# merge line
ax.plot([2.6, 7.6], [9.45, 9.45], color=SYS1_BORDER, lw=0.8, zorder=2)
arrow(ax, 5, 9.45, 5, 9.05, color='#333333', lw=1.2)

# ── 3. Decision diamond ─────────────────────────────────────────────
draw_diamond(ax, 5, 8.5, 2.6, 1.0, 'Tension\nDetected?', DIAMOND_BG)

# No path → right → Proceed (routine)
arrow_label(ax, 6.3, 8.5, 8.0, 8.5, 'No', color='#2E7D32', offset=(0, 0.18))
draw_box(ax, (8.0, 8.15), 1.6, 0.7, 'Proceed\n(routine)', '#C8E6C9', ec='#2E7D32',
         fontsize=8, fontweight='bold')

# Yes path → down → System 2
arrow_label(ax, 5, 8.0, 5, 7.5, 'Yes', color='#C62828', offset=(0.25, 0))

# ── 4. System 2 region ──────────────────────────────────────────────
sys2_rect = FancyBboxPatch((1.2, 4.3), 7.6, 3.1, boxstyle='round,pad=0.2',
                           facecolor=SYS2_BG, edgecolor=SYS2_BORDER, linewidth=1.8,
                           alpha=0.2, zorder=1)
ax.add_patch(sys2_rect)
ax.text(1.6, 7.1, 'System 2', fontsize=11, fontweight='bold', color=SYS2_BORDER,
        fontstyle='italic', zorder=3)
ax.text(1.6, 6.75, '(deep moral reasoning, triggered)', fontsize=7.5, color=SYS2_BORDER, zorder=3)

# Three gates
gates = [
    (1.8, 4.8, 2.0, 1.4, 'Gate P\n─────\nProvenance\nVerification'),
    (4.1, 4.8, 2.0, 1.4, 'Gate I\n─────\nIntrinsic Evil\nCheck'),
    (6.4, 4.8, 2.0, 1.4, 'Gate V\n─────\nVirtue Score\n(Clarity \u00d7 Stakes)'),
]
for (x, y, w, h, txt) in gates:
    draw_box(ax, (x, y), w, h, txt, GATE_BG, ec=SYS2_BORDER, lw=1.0, fontsize=7.5)

# Arrow from top into System 2
arrow(ax, 5, 7.5, 5, 6.2, color=SYS2_BORDER, lw=1.2)
# Fan out to gates
ax.plot([2.8, 7.4], [6.2, 6.2], color=SYS2_BORDER, lw=0.8, zorder=2)
for (x, y, w, h, _) in gates:
    arrow(ax, x + w/2, 6.2, x + w/2, y + h, color=SYS2_BORDER, lw=0.8)

# Gates merge down
for (x, y, w, h, _) in gates:
    arrow(ax, x + w/2, y, x + w/2, 4.15, color=SYS2_BORDER, lw=0.8)
ax.plot([2.8, 7.4], [4.15, 4.15], color=SYS2_BORDER, lw=0.8, zorder=2)
arrow(ax, 5, 4.15, 5, 3.7)

# ── 5. Four-tier output ─────────────────────────────────────────────
tier_labels = ['Proceed', 'Note', 'Pause', 'Escalate']
tier_x = [1.4, 3.4, 5.4, 7.4]
for i, (lbl, x, tc) in enumerate(zip(tier_labels, tier_x, TIER_COLORS)):
    draw_box(ax, (x, 3.0), 1.7, 0.6, lbl, tc, ec='#333333', lw=1.0,
             fontsize=9, fontweight='bold', text_color='white' if i == 3 else TEXT_DARK)

# Arrow from merge to each tier
for x in tier_x:
    arrow(ax, 5, 3.7, x + 0.85, 3.6, color='#555555', lw=0.7)

# tier label
ax.text(5, 3.82, 'Output Tiers', ha='center', va='bottom', fontsize=8,
        fontweight='bold', color=TEXT_DARK, zorder=5,
        bbox=dict(facecolor='white', edgecolor='none', alpha=0.8, pad=1.5))

# ── 6. Bottom outputs ───────────────────────────────────────────────
# Proceed/Note → Tool Execution
arrow(ax, 2.25, 3.0, 2.25, 2.3)
arrow(ax, 4.25, 3.0, 3.5, 2.3)
draw_box(ax, (1.3, 1.7), 3.0, 0.55, 'Tool Execution', OUTPUT_BG, lw=1.2,
         fontsize=9, fontweight='bold')

# Pause/Escalate → Human Confirmation
arrow(ax, 6.25, 3.0, 6.25, 2.3)
arrow(ax, 8.25, 3.0, 7.5, 2.3)
draw_box(ax, (5.5, 1.7), 3.0, 0.55, 'Human Confirmation', OUTPUT_BG, lw=1.2,
         fontsize=9, fontweight='bold')

# ── 7. Title ─────────────────────────────────────────────────────────
ax.text(5, 14.3, 'Conscience Simulator Module Architecture (Dual-Process System)',
        ha='center', va='center', fontsize=11, fontweight='bold', color=TEXT_DARK)

# ── Save ─────────────────────────────────────────────────────────────
import os
out = os.path.dirname(os.path.abspath(__file__))
fig.savefig(f'{out}/fig1_conscience_architecture.png', dpi=300, facecolor='white')
fig.savefig(f'{out}/fig1_conscience_architecture.pdf', facecolor='white')
plt.close()
print('Figure 1 saved.')
