"""
Figure 2: Clarity x Stakes Matrix (10x10 heatmap)
Publication-quality for Philosophy & Technology (Springer)
"""
import matplotlib.pyplot as plt
import matplotlib.colors as mcolors
import numpy as np
from matplotlib.patches import Rectangle

plt.rcParams.update({
    'font.family': 'Arial',
    'font.size': 9,
    'axes.linewidth': 0.8,
    'figure.dpi': 300,
    'savefig.dpi': 300,
    'savefig.bbox': 'tight',
    'savefig.pad_inches': 0.15,
})

# ── Build the 10x10 score matrix: Score = Clarity * Stakes ──────────
clarity = np.arange(1, 11)
stakes  = np.arange(1, 11)
C, S = np.meshgrid(clarity, stakes)
score = C * S  # shape (10, 10), rows=stakes, cols=clarity

# ── Threshold boundaries ────────────────────────────────────────────
# Proceed: 1-15   Note: 16-35   Pause: 36-60   Escalate: 61-100
bounds = [0.5, 15.5, 35.5, 60.5, 100.5]
# Colorblind-safe: Okabe-Ito inspired
colors_list = ['#009E73', '#F0E442', '#E69F00', '#CC3311']
cmap = mcolors.ListedColormap(colors_list)
norm = mcolors.BoundaryNorm(bounds, cmap.N)

fig, ax = plt.subplots(figsize=(6.5, 5.5))

# Heatmap
im = ax.pcolormesh(np.arange(0.5, 11.5), np.arange(0.5, 11.5), score,
                    cmap=cmap, norm=norm, edgecolors='white', linewidth=0.4)

# Add score text in each cell
for i in range(10):
    for j in range(10):
        val = score[i, j]
        tc = 'white' if val > 60 else '#1A1A1A'
        ax.text(j + 1, i + 1, str(val), ha='center', va='center',
                fontsize=7, fontweight='bold', color=tc)

# ── Threshold contour lines (bold) ──────────────────────────────────
# Draw contours at threshold boundaries on the continuous surface
# We overlay contour lines at 15.5, 35.5, 60.5
X_fine = np.linspace(0.5, 10.5, 200)
Y_fine = np.linspace(0.5, 10.5, 200)
Xf, Yf = np.meshgrid(X_fine, Y_fine)
Sf = Xf * Yf
contour_levels = [15.5, 35.5, 60.5]
cs = ax.contour(Xf, Yf, Sf, levels=contour_levels, colors='#1A1A1A',
                linewidths=2.0, linestyles='-')

# ── Zone labels ─────────────────────────────────────────────────────
zone_labels = [
    (2.0, 2.5, 'PROCEED\n(1 \u2013 15)', 'white', '#006B4F'),
    (4.5, 4.5, 'NOTE\n(16 \u2013 35)', 'white', '#8B7500'),
    (6.5, 6.8, 'PAUSE\n(36 \u2013 60)', 'white', '#B07000'),
    (9.0, 9.0, 'ESCALATE\n(61 \u2013 100)', 'white', 'white'),
]
for x, y, txt, bg, tc in zone_labels:
    ax.text(x, y, txt, ha='center', va='center', fontsize=8.5, fontweight='bold',
            color=tc, zorder=5,
            bbox=dict(facecolor=bg, edgecolor='#333333', alpha=0.85, pad=3,
                      boxstyle='round,pad=0.3'))

# ── Axes ─────────────────────────────────────────────────────────────
ax.set_xticks(range(1, 11))
ax.set_yticks(range(1, 11))
ax.set_xlabel('Clarity', fontsize=11, fontweight='bold', labelpad=8)
ax.set_ylabel('Stakes', fontsize=11, fontweight='bold', labelpad=8)
ax.set_xlim(0.5, 10.5)
ax.set_ylim(0.5, 10.5)
ax.set_aspect('equal')
ax.tick_params(length=3, width=0.6)

# Colorbar
cbar = fig.colorbar(im, ax=ax, ticks=[8, 25, 48, 80], shrink=0.8, pad=0.03)
cbar.ax.set_yticklabels(['Proceed', 'Note', 'Pause', 'Escalate'], fontsize=8)
cbar.ax.tick_params(length=0)
cbar.outline.set_linewidth(0.5)

# Title
ax.set_title('Figure 2.  Clarity \u00d7 Stakes Scoring Matrix',
             fontsize=11, fontweight='bold', pad=12)

fig.tight_layout()

out = r'c:\Users\javierg\Documents\Javier Documents\BreviTest\Leos Guardian Angel Paper\figures'
fig.savefig(f'{out}/fig2_clarity_stakes.png', dpi=300, facecolor='white')
fig.savefig(f'{out}/fig2_clarity_stakes.pdf', facecolor='white')
plt.close()
print('Figure 2 saved.')
