// Reads a PDF in the browser and returns its text as pages of { str, x, y, w }.
// pdf.js is self-hosted in /vendor and only loaded when someone actually imports a statement.
let pdfjs;
async function load() {
    if (!pdfjs) {
        pdfjs = await import("./vendor/pdf.min.mjs");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL("./vendor/pdf.worker.min.mjs", import.meta.url).href;
    }
    return pdfjs;
}

// askPassword(wrong) -> Promise<string | null>   (null = the person cancelled)
export async function readPdf(file, { askPassword, onProgress } = {}) {
    const lib = await load();
    const data = new Uint8Array(await file.arrayBuffer());
    let password, doc, task;
    for (;;) {
        task = lib.getDocument({ data: data.slice(), password });
        try { doc = await task.promise; break; }
        catch (err) {
            await task.destroy().catch(() => {});
            if (err && err.name === "PasswordException") {
                const wrong = err.code === lib.PasswordResponses.INCORRECT_PASSWORD;
                password = askPassword ? await askPassword(wrong) : null;
                if (password == null) { const e = new Error("cancelled"); e.cancelled = true; throw e; }
                continue;
            }
            throw err;
        }
    }
    const pages = [];
    for (let n = 1; n <= doc.numPages; n++) {
        const page = await doc.getPage(n);
        const content = await page.getTextContent();
        pages.push(content.items.filter(i => typeof i.str === "string")
            .map(i => ({ str: i.str, x: i.transform[4], y: i.transform[5], w: i.width })));
        page.cleanup();
        if (onProgress) onProgress(n, doc.numPages);
    }
    await task.destroy().catch(() => {});
    return pages;
}
