"""
Figure 3: Three-Level Safety Stack (Subsidiarity)
Publication-quality layered diagram for Philosophy & Technology (Springer)
"""
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch
import numpy as np

plt.rcParams.update({
    'font.family': 'Arial',
    'font.size': 9,
    'axes.linewidth': 0.5,
    'figure.dpi': 300,
    'savefig.dpi': 300,
    'savefig.bbox': 'tight',
    'savefig.pad_inches': 0.15,
})

# ── Colors (colorblind-safe, dark-to-light bottom-to-top) ───────────
LEVEL1_FC = '#2C3E6B'  # dark navy
LEVEL1_EC = '#1A2540'
LEVEL2_FC = '#6A7EB8'  # medium blue
LEVEL2_EC = '#4A5E98'
LEVEL3_FC = '#B3C4E8'  # light blue
LEVEL3_EC = '#8AA0CC'
TEXT_LIGHT = '#FFFFFF'
TEXT_DARK  = '#1A1A1A'
ARROW_COL  = '#555555'

fig, ax = plt.subplots(figsize=(7.5, 6.0))
ax.set_xlim(0, 10)
ax.set_ylim(0, 8.5)
ax.axis('off')
fig.patch.set_facecolor('white')

# ── Layer dimensions ─────────────────────────────────────────────────
layer_x = 2.0
layer_w = 6.0
layer_h = 1.5
gap = 0.25

layers = [
    # (y, fc, ec, title, subtitle, text_color)
    (1.0, LEVEL1_FC, LEVEL1_EC, 'Level 1: Synderesis',
     'Non-negotiable primitives\n(e.g., "do not deceive about being AI")', TEXT_LIGHT),
    (1.0 + layer_h + gap, LEVEL2_FC, LEVEL2_EC, 'Level 2: Conscientia',
     'Adaptive moral faculty\n(context-sensitive reasoning via Gates P, I, V)', TEXT_LIGHT),
    (1.0 + 2*(layer_h + gap), LEVEL3_FC, LEVEL3_EC, 'Level 3: Communal Norms',
     'Emergent standards\n(cross-agent aggregation, evolving best practices)', TEXT_DARK),
]

for i, (y, fc, ec, title, subtitle, tc) in enumerate(layers):
    box = FancyBboxPatch((layer_x, y), layer_w, layer_h,
                         boxstyle='round,pad=0.15',
                         facecolor=fc, edgecolor=ec, linewidth=2.0, zorder=2)
    ax.add_patch(box)
    # Title
    ax.text(layer_x + layer_w/2, y + layer_h*0.68, title,
            ha='center', va='center', fontsize=11, fontweight='bold',
            color=tc, zorder=3)
    # Subtitle
    ax.text(layer_x + layer_w/2, y + layer_h*0.30, subtitle,
            ha='center', va='center', fontsize=8.5, color=tc, zorder=3,
            multialignment='center', fontstyle='italic')

# ── "Supports but does not supplant" arrows ──────────────────────────
for i in range(2):
    y_bot = layers[i][0] + layer_h
    y_top = layers[i+1][0]
    mid_y = (y_bot + y_top) / 2

    # Upward arrow (supports)
    ax.annotate('', xy=(4.2, y_top - 0.02), xytext=(4.2, y_bot + 0.02),
                arrowprops=dict(arrowstyle='-|>', color=ARROW_COL, lw=1.5),
                zorder=4)
    # Label
    ax.text(5.0, mid_y, 'supports but does\nnot supplant',
            ha='left', va='center', fontsize=7, color=ARROW_COL,
            fontstyle='italic', zorder=5,
            bbox=dict(facecolor='white', edgecolor='none', alpha=0.9, pad=1))

# ── Side labels: Individual ↔ Collective ────────────────────────────
# Left side: "Individual"
mid_y_all = layers[0][0] + (layers[2][0] + layer_h - layers[0][0]) / 2
ax.annotate('', xy=(1.3, layers[2][0] + layer_h), xytext=(1.3, layers[0][0]),
            arrowprops=dict(arrowstyle='<->', color='#333333', lw=1.5),
            zorder=4)
ax.text(0.5, mid_y_all - 0.6, 'Individual', ha='center', va='center',
        fontsize=9, fontweight='bold', color=TEXT_DARK, rotation=90, zorder=5)
ax.text(0.5, mid_y_all + 0.6, 'Collective', ha='center', va='center',
        fontsize=9, fontweight='bold', color=TEXT_DARK, rotation=90, zorder=5)

# ── Priority ordering annotation ────────────────────────────────────
ax.annotate('', xy=(8.8, layers[0][0]), xytext=(8.8, layers[2][0] + layer_h),
            arrowprops=dict(arrowstyle='-|>', color='#C62828', lw=2.0,
                            linestyle='--'),
            zorder=4)
ax.text(9.4, mid_y_all, 'Strict\npriority\nordering',
        ha='center', va='center', fontsize=8, fontweight='bold',
        color='#C62828', zorder=5,
        bbox=dict(facecolor='#FDEAEA', edgecolor='#C62828', alpha=0.9,
                  pad=3, boxstyle='round,pad=0.3'))

# ── Foundation label ─────────────────────────────────────────────────
ax.text(layer_x + layer_w/2, layers[0][0] - 0.35, 'Foundation',
        ha='center', va='center', fontsize=8, fontweight='bold',
        color=LEVEL1_EC, fontstyle='italic')

# ── Title ────────────────────────────────────────────────────────────
ax.text(5, 7.8, 'Three-Level Safety Stack (Subsidiarity Principle)',
        ha='center', va='center', fontsize=11, fontweight='bold', color=TEXT_DARK)

import os
out = os.path.dirname(os.path.abspath(__file__))
fig.savefig(f'{out}/fig3_safety_stack.png', dpi=300, facecolor='white')
fig.savefig(f'{out}/fig3_safety_stack.pdf', facecolor='white')
plt.close()
print('Figure 3 saved.')
