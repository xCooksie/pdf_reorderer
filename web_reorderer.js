/**
 * PDF Page Reorderer — Web Edition
 * 브라우저 내에서 pdf-lib를 사용하여 PDF 페이지를 재정렬합니다.
 * 서버 업로드 없이 100% 클라이언트 사이드에서 동작합니다.
 */
(function () {
    "use strict";

    // ===== State =====
    let loadedFile = null;   // { name, size, arrayBuffer, numPages }

    // ===== DOM References =====
    const dropzone       = document.getElementById("dropzone");
    const fileInput      = document.getElementById("fileInput");
    const dropzoneEmpty  = document.getElementById("dropzoneEmpty");
    const dropzoneLoaded = document.getElementById("dropzoneLoaded");
    const fileNameEl     = document.getElementById("fileName");
    const fileDetailEl   = document.getElementById("fileDetail");
    const removeBtn      = document.getElementById("removeBtn");
    const startPageInput = document.getElementById("startPage");
    const endPageInput   = document.getElementById("endPage");
    const previewContent = document.getElementById("previewContent");
    const errorMsg       = document.getElementById("errorMsg");
    const actionBtn      = document.getElementById("actionBtn");
    const btnLabel       = document.getElementById("btnLabel");
    const spinner        = document.getElementById("spinner");
    const progressCont   = document.getElementById("progressContainer");
    const progressFill   = document.getElementById("progressFill");
    const progressLabel  = document.getElementById("progressLabel");
    const toast          = document.getElementById("toast");

    // ===== Helpers =====
    function formatBytes(bytes) {
        if (bytes < 1024) return bytes + " B";
        if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
        return (bytes / 1048576).toFixed(1) + " MB";
    }

    function showToast(message, type = "success") {
        toast.textContent = message;
        toast.className = "toast " + type;
        requestAnimationFrame(() => toast.classList.add("show"));
        setTimeout(() => toast.classList.remove("show"), 3500);
    }

    function showError(msg) {
        errorMsg.textContent = "⚠️ " + msg;
        errorMsg.classList.add("visible");
    }
    function hideError() {
        errorMsg.textContent = "";
        errorMsg.classList.remove("visible");
    }

    function setProgress(pct, label) {
        progressFill.style.width = pct + "%";
        if (label) progressLabel.textContent = label;
    }

    // ===== Reorder Sequence Logic =====
    /**
     * 1-indexed 페이지 번호 기반으로 재정렬 순서를 계산합니다.
     * S가 우선, S+1이 나중 패턴을 적용합니다.
     */
    function calculateReorderedSequence(numPages, startPage, endPage) {
        if (numPages <= 0) return [];
        if (startPage < 1 || endPage > numPages || startPage > endPage) {
            throw new Error(
                `유효하지 않은 범위: 시작(${startPage}), 끝(${endPage}), 전체(${numPages})`
            );
        }

        const pre = [];
        for (let i = 1; i < startPage; i++) pre.push(i);

        const post = [];
        for (let i = endPage + 1; i <= numPages; i++) post.push(i);

        const startParity = startPage % 2;
        const firstGroup = [];
        const secondGroup = [];
        for (let p = startPage; p <= endPage; p++) {
            if (p % 2 === startParity) firstGroup.push(p);
            else secondGroup.push(p);
        }

        return [...pre, ...firstGroup, ...secondGroup, ...post];
    }

    /**
     * 미리보기용 HTML 문자열을 생성합니다.
     */
    function buildPreviewHTML(numPages, startPage, endPage) {
        const seq = calculateReorderedSequence(numPages, startPage, endPage);
        const startParity = startPage % 2;

        const parts = seq.map((p) => {
            if (p < startPage || p > endPage) {
                return `<span class="group-unchanged">${p}</span>`;
            } else if (p % 2 === startParity) {
                return `<span class="group-first">${p}</span>`;
            } else {
                return `<span class="group-second">${p}</span>`;
            }
        });

        return parts.join(", ");
    }

    // ===== File Loading =====
    async function handleFile(file) {
        if (!file || file.type !== "application/pdf") {
            showToast("PDF 파일만 선택할 수 있습니다.", "error");
            return;
        }

        try {
            const arrayBuffer = await file.arrayBuffer();
            // pdf-lib로 페이지 수 파악
            const pdfDoc = await PDFLib.PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
            const numPages = pdfDoc.getPageCount();

            loadedFile = {
                name: file.name,
                size: file.size,
                arrayBuffer: arrayBuffer,
                numPages: numPages,
            };

            // UI 업데이트
            fileNameEl.textContent = file.name;
            fileDetailEl.textContent = `${numPages} 페이지 · ${formatBytes(file.size)}`;
            dropzoneEmpty.style.display = "none";
            dropzoneLoaded.style.display = "block";
            dropzone.classList.add("has-file");

            // 끝 페이지 자동 설정 (기본값은 끝 페이지)
            endPageInput.value = numPages;

            actionBtn.disabled = false;
            updatePreview();
        } catch (err) {
            showToast("PDF 파일을 읽을 수 없습니다: " + err.message, "error");
        }
    }

    function clearFile() {
        loadedFile = null;
        fileInput.value = "";
        dropzoneEmpty.style.display = "";
        dropzoneLoaded.style.display = "none";
        dropzone.classList.remove("has-file");
        actionBtn.disabled = true;
        previewContent.innerHTML = "PDF 파일을 먼저 선택해 주세요.";
        hideError();
    }

    // ===== Preview Update =====
    function updatePreview() {
        hideError();
        if (!loadedFile) {
            previewContent.innerHTML = "PDF 파일을 먼저 선택해 주세요.";
            return;
        }

        const s = parseInt(startPageInput.value, 10);
        const e = parseInt(endPageInput.value, 10);
        const n = loadedFile.numPages;

        startPageInput.classList.remove("error");
        endPageInput.classList.remove("error");

        if (isNaN(s) || isNaN(e)) {
            previewContent.innerHTML = "시작 페이지와 끝 페이지를 입력해 주세요.";
            return;
        }

        try {
            if (s < 1) { startPageInput.classList.add("error"); throw new Error("시작 페이지는 1 이상이어야 합니다."); }
            if (e > n) { endPageInput.classList.add("error"); throw new Error(`끝 페이지는 전체 페이지 수(${n}) 이하여야 합니다.`); }
            if (s > e) { startPageInput.classList.add("error"); endPageInput.classList.add("error"); throw new Error("시작 페이지는 끝 페이지보다 작거나 같아야 합니다."); }

            previewContent.innerHTML = buildPreviewHTML(n, s, e);
        } catch (err) {
            previewContent.innerHTML = '<span style="color:var(--text-muted)">정렬 정보를 표시할 수 없습니다.</span>';
            showError(err.message);
        }
    }

    // ===== Reorder & Download =====
    async function runReorder() {
        if (!loadedFile) return;

        const s = parseInt(startPageInput.value, 10);
        const e = parseInt(endPageInput.value, 10);
        const n = loadedFile.numPages;

        // Validate once more
        if (isNaN(s) || isNaN(e) || s < 1 || e > n || s > e) {
            showToast("페이지 범위를 다시 확인해 주세요.", "error");
            return;
        }

        // Disable UI during processing
        actionBtn.disabled = true;
        btnLabel.textContent = "처리 중…";
        spinner.style.display = "block";
        progressCont.classList.add("visible");
        setProgress(0, "PDF 파일 분석 중…");

        try {
            const sequence = calculateReorderedSequence(n, s, e);

            setProgress(10, "원본 PDF 로드 중…");
            // Load source document
            const srcDoc = await PDFLib.PDFDocument.load(loadedFile.arrayBuffer, { ignoreEncryption: true });

            setProgress(20, "새 PDF 생성 중…");
            // Create destination document
            const destDoc = await PDFLib.PDFDocument.create();

            // Copy pages in the reordered sequence
            const total = sequence.length;
            // pdf-lib의 copyPages는 배열로 한번에 복사 가능
            const allIndices = sequence.map((p) => p - 1); // 0-indexed
            const copiedPages = await destDoc.copyPages(srcDoc, allIndices);

            for (let i = 0; i < copiedPages.length; i++) {
                destDoc.addPage(copiedPages[i]);
                // 진행률 갱신 (20~90% 범위에서)
                const pct = 20 + Math.round(((i + 1) / total) * 70);
                setProgress(pct, `페이지 복사 중… (${i + 1}/${total})`);
            }

            setProgress(95, "PDF 파일 생성 중…");
            const pdfBytes = await destDoc.save();

            setProgress(100, "다운로드 준비 완료!");

            // Trigger download
            const blob = new Blob([pdfBytes], { type: "application/pdf" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");

            const baseName = loadedFile.name.replace(/\.pdf$/i, "");
            a.href = url;
            a.download = baseName + "_reordered.pdf";
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            showToast("✅ 재정렬이 완료되었습니다! 파일이 다운로드됩니다.", "success");
        } catch (err) {
            showToast("오류 발생: " + err.message, "error");
            console.error(err);
        } finally {
            // Restore UI
            actionBtn.disabled = false;
            btnLabel.textContent = "🚀 페이지 재정렬 실행";
            spinner.style.display = "none";
            setTimeout(() => {
                progressCont.classList.remove("visible");
                setProgress(0, "");
            }, 2000);
        }
    }

    // ===== Event Listeners =====

    // Dropzone click → open file dialog
    dropzone.addEventListener("click", (e) => {
        if (e.target === removeBtn || removeBtn.contains(e.target)) return;
        fileInput.click();
    });

    fileInput.addEventListener("change", () => {
        if (fileInput.files.length > 0) handleFile(fileInput.files[0]);
    });

    // Drag & Drop
    dropzone.addEventListener("dragover", (e) => { e.preventDefault(); dropzone.classList.add("drag-over"); });
    dropzone.addEventListener("dragleave", () => { dropzone.classList.remove("drag-over"); });
    dropzone.addEventListener("drop", (e) => {
        e.preventDefault();
        dropzone.classList.remove("drag-over");
        if (e.dataTransfer.files.length > 0) handleFile(e.dataTransfer.files[0]);
    });

    // Remove file button
    removeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        clearFile();
    });

    // Live preview on input change
    startPageInput.addEventListener("input", updatePreview);
    endPageInput.addEventListener("input", updatePreview);

    // Action button
    actionBtn.addEventListener("click", runReorder);

})();
