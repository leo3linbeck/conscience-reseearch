"""
Figure 4: Comparison Table — Top-Down Safety vs. Conscience Simulator Module
Publication-quality table figure for Philosophy & Technology (Springer)
"""
import matplotlib.pyplot as plt
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

# ── Table data ───────────────────────────────────────────────────────
columns = ['Feature', 'Top-Down Safety', 'Conscience Simulator Module']
data = [
    ['Authority locus',
     'Central regulatory body\nor vendor',
     'Distributed to each\nagent instance'],
    ['Failure mode',
     'Brittle: single-point\ncatastrophic failure',
     'Graceful degradation;\nfails to caution'],
    ['Adaptability',
     'Slow (regulatory lag,\nupdate cycles)',
     'Real-time contextual\nreasoning per query'],
    ['Innovation impact',
     'Constrains via blanket\nprohibitions',
     'Permits exploration within\nprincipled boundaries'],
    ['Principal role',
     'Rule-follower;\ncompliance-oriented',
     'Moral agent with\ndeliberative capacity'],
    ['Scalability\nmechanism',
     'Centralized rule\ndistribution',
     'Subsidiarity: local\nautonomy + communal norms'],
    ['Philosophical\nbasis',
     'Deontological /\nconsequentialist rules',
     'Thomistic virtue ethics\n(synderesis + conscientia)'],
]

n_rows = len(data)
n_cols = 3

# ── Figure ───────────────────────────────────────────────────────────
fig, ax = plt.subplots(figsize=(7.5, 5.5))
ax.axis('off')
fig.patch.set_facecolor('white')

# Colors
HEADER_BG   = '#2C3E6B'
HEADER_TEXT  = '#FFFFFF'
ROW_EVEN     = '#F0F3FA'
ROW_ODD      = '#FFFFFF'
FEAT_BG      = '#E8ECF4'
BORDER       = '#AAAAAA'
TEXT_DARK     = '#1A1A1A'

# Column widths (proportional)
col_widths = [0.22, 0.39, 0.39]
col_x = [0.0]
for w in col_widths[:-1]:
    col_x.append(col_x[-1] + w)

# Table positioning
table_left = 0.04
table_top = 0.92
row_height = 0.095
header_height = 0.055

def draw_cell(ax, x, y, w, h, text, fc, tc, fontsize=8.5, fontweight='normal',
              ha='center', va='center'):
    rect = plt.Rectangle((x, y), w, h, transform=ax.transAxes,
                          facecolor=fc, edgecolor=BORDER, linewidth=0.6,
                          clip_on=False, zorder=2)
    ax.add_patch(rect)
    ax.text(x + w/2, y + h/2, text, transform=ax.transAxes,
            ha=ha, va=va, fontsize=fontsize, fontweight=fontweight,
            color=tc, zorder=3, multialignment='center')

# ── Header row ───────────────────────────────────────────────────────
for j, (col_name, cx, cw) in enumerate(zip(columns, col_x, col_widths)):
    draw_cell(ax, table_left + cx, table_top, cw, header_height,
              col_name, HEADER_BG, HEADER_TEXT, fontsize=10, fontweight='bold')

# ── Data rows ────────────────────────────────────────────────────────
for i, row in enumerate(data):
    y = table_top - (i + 1) * row_height
    bg = ROW_EVEN if i % 2 == 0 else ROW_ODD
    for j, (cell, cx, cw) in enumerate(zip(row, col_x, col_widths)):
        fc = FEAT_BG if j == 0 else bg
        fw = 'bold' if j == 0 else 'normal'
        fs = 8.5 if j == 0 else 8.5
        draw_cell(ax, table_left + cx, y, cw, row_height,
                  cell, fc, TEXT_DARK, fontsize=fs, fontweight=fw)

# ── Title ────────────────────────────────────────────────────────────
ax.text(0.5, 0.99, 'Comparison: Top-Down Safety vs. Conscience Simulator Module',
        ha='center', va='bottom', fontsize=11, fontweight='bold',
        color=TEXT_DARK, transform=ax.transAxes)

import os
out = os.path.dirname(os.path.abspath(__file__))
fig.savefig(f'{out}/fig4_comparison_table.png', dpi=300, facecolor='white')
fig.savefig(f'{out}/fig4_comparison_table.pdf', facecolor='white')
plt.close()
print('Figure 4 saved.')
