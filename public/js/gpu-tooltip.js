// gpu-tooltip.js
// Finds any <th> or <td> whose text includes "4090" and injects a
// CSS-only hover thumbnail using gpu.png.
// Works for both static HTML and markdown-rendered tables (marked.js).

(function () {
    function patchGpuCells() {
        document.querySelectorAll('th, td').forEach(function (el) {
            if (!el.textContent.includes('4090')) return;
            if (el.querySelector('.gpu-tooltip-trigger')) return;

            el.innerHTML = el.innerHTML.replace(
                /((?:GPU\s+)?(?:NVIDIA\s+)?RTX\s*4090[^<\n]*)/i,
                '<span class="gpu-tooltip-trigger" tabindex="0" aria-label="NVIDIA RTX 4090 – hover to see image">$1' +
                '<span class="gpu-tooltip-img" aria-hidden="true">' +
                '<img src="gpu.png" alt="NVIDIA GeForce RTX 4090">' +
                '<span class="gpu-tooltip-caption">NVIDIA RTX 4090</span>' +
                '</span>' +
                '</span>'
            );
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () {
            patchGpuCells();
            setTimeout(patchGpuCells, 600);
        });
    } else {
        patchGpuCells();
        setTimeout(patchGpuCells, 600);
    }
})();
