
/* ======================================================
   RELIGUARD AI 2.0 - ENGINEERING MODULE
   Complete Frontend JavaScript
====================================================== */

const API = "http://127.0.0.1:8000";

// ------------------------------------------------------
// ELEMENT REFERENCES
// ------------------------------------------------------

const projectFile = document.getElementById("projectFile");
const analyzeBtn = document.getElementById("analyzeBtn");
const applyFixBtn = document.getElementById("applyFixBtn");

const fileStatus = document.getElementById("fileStatus");
const projectStatus = document.getElementById("projectStatus");
const issueCount = document.getElementById("issueCount");
const fixStatus = document.getElementById("fixStatus");
const analysisOutput = document.getElementById("analysisOutput");

const zipProject = document.getElementById("zipProject");
const zipProjectVisible = document.getElementById("zipProjectVisible");
const scanZipBtn = document.getElementById("scanZipBtn");
const zipStatus = document.getElementById("zipStatus");

const repairZipBtn = document.getElementById("repairZipBtn");
const repairStatus = document.getElementById("repairStatus");
const repairReport = document.getElementById("repairReport");

const chatMessages = document.getElementById("chatMessages");
const chatInput = document.getElementById("chatInput");
const sendBtn = document.getElementById("sendBtn");

const attachmentBtn = document.getElementById("attachmentBtn");
const attachmentMenu = document.getElementById("attachmentMenu");

const uploadCodeOption = document.getElementById("uploadCodeOption");
const uploadImageOption = document.getElementById("uploadImageOption");
const cameraOption = document.getElementById("cameraOption");
const uploadZipOption = document.getElementById("uploadZipOption");

const imageFile = document.getElementById("imageFile");
const cameraFile = document.getElementById("cameraFile");

const cameraSection = document.getElementById("cameraSection");
const cameraPreview = document.getElementById("cameraPreview");
const captureImageBtn = document.getElementById("captureImageBtn");
const closeCameraBtn = document.getElementById("closeCameraBtn");
const cameraCanvas = document.getElementById("cameraCanvas");

const micBtn = document.getElementById("micBtn");

const quickAnalyze = document.getElementById("quickAnalyze");
const quickProject = document.getElementById("quickProject");
const quickImage = document.getElementById("quickImage");

const newChatBtn = document.getElementById("newChatBtn");
const scannerButton = document.getElementById("openProjectScanner");
const repairButton = document.getElementById("openRepair");


// ------------------------------------------------------
// APPLICATION STATE
// ------------------------------------------------------

let fileToFix = null;
let projectScanned = false;
let cameraStream = null;
let selectedCodeFiles = [];

let pendingChatCode = "";
let pendingChatFilename = "pasted_code.py";


// ------------------------------------------------------
// BASIC HELPERS
// ------------------------------------------------------

function setText(element, value) {
    if (element) element.textContent = value;
}

function addMessage(message, type = "bot-message") {
    if (!chatMessages) {
        console.log(message);
        return null;
    }

    const element = document.createElement("div");
    element.className = "chat-message " + type;
    element.textContent = message;

    chatMessages.appendChild(element);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    return element;
}

function addReportMessage(title, content) {
    if (!chatMessages) return null;

    const element = document.createElement("div");
    element.className = "chat-message bot-message";

    const heading = document.createElement("h3");
    heading.textContent = title;

    const paragraph = document.createElement("p");
    paragraph.textContent = content;

    element.appendChild(heading);
    element.appendChild(paragraph);

    chatMessages.appendChild(element);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    return element;
}

function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = filename;

    document.body.appendChild(link);
    link.click();
    link.remove();

    setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function downloadText(text, filename) {
    downloadBlob(
        new Blob([text], { type: "text/plain;charset=utf-8" }),
        filename
    );
}

async function requestBackend(endpoint, options = {}) {
    const response = await fetch(API + endpoint, options);
    const contentType = response.headers.get("content-type") || "";

    let data;

    if (contentType.includes("application/json")) {
        data = await response.json();
    } else {
        data = await response.blob();
    }

    if (!response.ok) {
        throw new Error(
            data && data.message
                ? data.message
                : "Backend request failed. Check that the backend is running."
        );
    }

    return { response, data };
}

function showCorrectedCode(parent, correctedCode, filename) {
    if (!parent || !correctedCode) return;

    const wrapper = document.createElement("div");
    wrapper.className = "corrected-code-preview";

    const heading = document.createElement("h3");
    heading.textContent = "Verified Corrected Code";

    const description = document.createElement("p");
    description.textContent =
        "Review this corrected copy. Your original file is unchanged.";

    const code = document.createElement("pre");
    code.textContent = correctedCode;
    code.style.whiteSpace = "pre-wrap";
    code.style.overflowX = "auto";
    code.style.maxHeight = "350px";
    code.style.overflowY = "auto";

    const downloadButton = document.createElement("button");
    downloadButton.type = "button";
    downloadButton.textContent = "Download Corrected File";
    downloadButton.className = "send-btn";

    downloadButton.addEventListener("click", function () {
        downloadText(correctedCode, filename);
    });

    wrapper.appendChild(heading);
    wrapper.appendChild(description);
    wrapper.appendChild(code);
    wrapper.appendChild(downloadButton);

    parent.appendChild(wrapper);
    chatMessages?.scrollTo({
        top: chatMessages.scrollHeight,
        behavior: "smooth"
    });
}

function displayCorrectedCode(analysis, parent, filename) {
    if (
        analysis &&
        analysis.auto_fix_available &&
        analysis.corrected_code
    ) {
        showCorrectedCode(
            parent,
            analysis.corrected_code,
            "corrected_" + filename
        );

        setText(fixStatus, "Verified correction available for download");
        return true;
    }

    return false;
}


// ------------------------------------------------------
// FEATURE 1: SINGLE FILE ANALYSIS
// ------------------------------------------------------

async function analyzeSingleFile(file) {
    if (!file) return null;

    const formData = new FormData();
    formData.append("file", file);

    setText(projectStatus, "Analyzing...");
    setText(issueCount, "Checking...");
    setText(fixStatus, "Checking supported corrections...");

    if (analysisOutput) {
        analysisOutput.textContent =
            "Connecting to ReliGuard AI backend...";
    }

    if (analyzeBtn) analyzeBtn.disabled = true;
    if (applyFixBtn) applyFixBtn.disabled = true;

    fileToFix = null;

    try {
        const result = await requestBackend("/analyze", {
            method: "POST",
            body: formData
        });

        const data = result.data;

        if (!data.results || !data.results.length) {
            throw new Error("No analysis results returned.");
        }

        const analysis = data.results[0];
        const issues = analysis.issues || [];

        fileToFix =
            file.name.toLowerCase().endsWith(".py") &&
            analysis.auto_fix_available
                ? file
                : null;

        if (applyFixBtn) {
            applyFixBtn.disabled = !fileToFix;
        }

        setText(projectStatus, analysis.status);
        setText(issueCount, issues.length + " issue(s)");

        setText(
            fixStatus,
            analysis.auto_fix_available
                ? "Verified correction available"
                : "No supported automatic correction"
        );

        const report =
            "File: " + (analysis.file || file.name) +
            "\nStatus: " + analysis.status +
            "\n\nDetected issues:\n" +
            (issues.length ? issues.join("\n") : "No issues detected.") +
            "\n\nSuggested fix:\n" +
            (analysis.suggested_fix || "No suggested fix available.");

        if (analysisOutput) {
            analysisOutput.textContent = report;
        }

        const reportElement = addReportMessage(
            "File Analysis: " + file.name,
            report
        );

        displayCorrectedCode(
            analysis,
            reportElement,
            file.name
        );

        return analysis;

    } catch (error) {
        setText(projectStatus, "Analysis failed");

        if (analysisOutput) {
            analysisOutput.textContent = error.message;
        }

        addMessage("Analysis failed: " + error.message);
        throw error;

    } finally {
        if (analyzeBtn) analyzeBtn.disabled = false;
    }
}


// ------------------------------------------------------
// FEATURE 2: MULTIPLE FILE ANALYSIS
// ------------------------------------------------------

async function analyzeMultipleFiles(files) {
    if (!files || !files.length) {
        addMessage("Please select code files first.");
        return;
    }

    addMessage("Analyzing " + files.length + " selected file(s)...");

    let completed = 0;
    let failed = 0;

    for (const file of files) {
        try {
            await analyzeSingleFile(file);
            completed++;
        } catch (error) {
            failed++;
        }
    }

    addMessage(
        "File analysis finished.\n" +
        "Successfully analyzed: " + completed +
        "\nFailed: " + failed
    );
}


// ------------------------------------------------------
// FEATURE 3: CODE FILE SELECTION
// ------------------------------------------------------

if (projectFile) {
    projectFile.addEventListener("change", async function () {
        selectedCodeFiles = Array.from(projectFile.files || []);

        fileToFix = null;

        if (applyFixBtn) {
            applyFixBtn.disabled = true;
        }

        if (!selectedCodeFiles.length) {
            setText(fileStatus, "No files selected yet.");
            return;
        }

        setText(
            fileStatus,
            selectedCodeFiles.length + " file(s) selected."
        );

        addMessage(
            "Selected " + selectedCodeFiles.length +
            " code file(s) for analysis.",
            "user-message"
        );

        await analyzeMultipleFiles(selectedCodeFiles);
    });
}


// ------------------------------------------------------
// FEATURE 4: APPROVAL-BASED SINGLE FILE FIX
// ------------------------------------------------------

if (applyFixBtn) {
    applyFixBtn.addEventListener("click", async function () {
        if (!fileToFix) {
            alert("No supported Python correction is available.");
            return;
        }

        const approved = confirm(
            "Apply the supported Python correction?\n\n" +
            "A corrected copy will be downloaded. " +
            "Your original file will remain unchanged."
        );

        if (!approved) return;

        const formData = new FormData();
        formData.append("file", fileToFix);

        applyFixBtn.disabled = true;

        try {
            const result = await requestBackend(
                "/apply-fix?approved=true",
                {
                    method: "POST",
                    body: formData
                }
            );

            const data = result.data;

            if (
                data.status !== "Fix Applied" ||
                !data.corrected_code
            ) {
                throw new Error(
                    data.message || "Fix could not be applied."
                );
            }

            downloadText(
                data.corrected_code,
                data.corrected_filename || "corrected_" + fileToFix.name
            );

            setText(fixStatus, "Corrected copy downloaded.");
            addMessage("Correction completed. Original file preserved.");

        } catch (error) {
            setText(fixStatus, "Fix failed");
            addMessage("Correction failed: " + error.message);

        } finally {
            applyFixBtn.disabled = false;
        }
    });
}


// ------------------------------------------------------
// FEATURE 5: ZIP SELECTION
// ------------------------------------------------------

function handleZipSelection(file) {
    projectScanned = false;

    if (repairZipBtn) repairZipBtn.disabled = true;

    setText(
        repairReport,
        "Repair report will appear after project repair."
    );

    if (file) {
        setText(zipStatus, "Selected: " + file.name);
        setText(repairStatus, "Click Scan Complete Project first.");
    } else {
        setText(zipStatus, "No ZIP project selected.");
        setText(repairStatus, "Scan your project first to enable repair.");
    }
}

if (zipProject) {
    zipProject.addEventListener("change", function () {
        handleZipSelection(zipProject.files[0] || null);
    });
}

if (zipProjectVisible) {
    zipProjectVisible.addEventListener("change", function () {
        const file = zipProjectVisible.files[0];
        if (!file) return;

        if (zipProject) {
            const transfer = new DataTransfer();
            transfer.items.add(file);
            zipProject.files = transfer.files;
        }

        handleZipSelection(file);
    });
}


// ------------------------------------------------------
// FEATURE 6: ZIP ANALYSIS REPORT
// ------------------------------------------------------

function displayZipAnalysis(data) {
    setText(projectStatus, "Analysis Complete");

    setText(
        issueCount,
        (data.issues_found ?? 0) + " issue(s) found"
    );

    setText(
        fixStatus,
        data.issues_found > 0
            ? "Review required"
            : "No supported issues detected"
    );

    const structure = (data.project_structure || []).join("\n");

    const details = (data.results || []).map(result => {
        return (
            "\nFile: " + result.file +
            "\nStatus: " + result.status +
            "\n" + (result.issues || []).join("\n")
        );
    }).join("\n");

    const report =
        "PROJECT ANALYSIS REPORT\n\n" +
        "Total project files: " + data.total_project_files +
        "\nFiles analyzed: " + data.total_files_analyzed +
        "\nIssues found: " + data.issues_found +
        "\n\nPROJECT FILES:\n" + structure +
        "\n\nDETAILED RESULTS:\n" + details;

    if (analysisOutput) {
        analysisOutput.textContent = report;
    }

    addReportMessage("Complete Project Analysis", report);
}


// ------------------------------------------------------
// FEATURE 7: COMPLETE PROJECT ZIP SCAN
// ------------------------------------------------------

if (scanZipBtn) {
    scanZipBtn.addEventListener("click", async function () {
        if (!zipProject || !zipProject.files.length) {
            alert("Please select a ZIP project first.");
            return;
        }

        const formData = new FormData();
        formData.append("file", zipProject.files[0]);

        scanZipBtn.disabled = true;
        if (repairZipBtn) repairZipBtn.disabled = true;

        projectScanned = false;

        setText(zipStatus, "Scanning complete project...");
        setText(repairStatus, "Project analysis in progress...");

        try {
            const result = await requestBackend("/analyze-zip", {
                method: "POST",
                body: formData
            });

            const data = result.data;

            if (data.status === "Error") {
                throw new Error(data.message || "Project scan failed.");
            }

            displayZipAnalysis(data);
            projectScanned = true;

            setText(zipStatus, "Project scan completed successfully!");

            if (repairZipBtn) repairZipBtn.disabled = false;

            setText(
                repairStatus,
                "Project scanned. Ready for approval-based repair."
            );

        } catch (error) {
            setText(projectStatus, "Scan failed");
            setText(zipStatus, "Scan failed: " + error.message);
            setText(repairStatus, "Repair unavailable until scanning succeeds.");

        } finally {
            scanZipBtn.disabled = false;
        }
    });
}


// ------------------------------------------------------
// FEATURE 8: APPROVAL-BASED ZIP REPAIR
// ------------------------------------------------------

if (repairZipBtn) {
    repairZipBtn.addEventListener("click", async function () {
        if (
            !zipProject ||
            !zipProject.files.length ||
            !projectScanned
        ) {
            alert("Please scan your ZIP project first.");
            return;
        }

        const approved = confirm(
            "Do you approve the project repairs?\n\n" +
            "ReliGuard AI will create a corrected ZIP copy.\n\n" +
            "Your original project will NOT be replaced."
        );

        if (!approved) {
            setText(repairStatus, "Repair cancelled.");
            return;
        }

        const formData = new FormData();
        formData.append("file", zipProject.files[0]);

        repairZipBtn.disabled = true;
        if (scanZipBtn) scanZipBtn.disabled = true;

        setText(repairStatus, "Repairing project...");
        setText(repairReport, "Repair in progress...");

        try {
            const result = await requestBackend(
                "/repair-zip?approved=true",
                {
                    method: "POST",
                    body: formData
                }
            );

            const data = result.data;

            if (!(data instanceof Blob)) {
                setText(
                    repairStatus,
                    data.message || "No repair was performed."
                );

                setText(
                    repairReport,
                    "Status: " + (data.status || "No changes") +
                    "\nMessage: " +
                    (data.message || "No supported corrections found.")
                );

                return;
            }

            const repairedZip = data;

            downloadBlob(
                repairedZip,
                "ReliGuard_Repaired_Project.zip"
            );

            const repairedCount =
                result.response.headers.get("X-Repaired-Files");

            setText(
                repairStatus,
                "Repair completed. Verifying repaired project..."
            );

            const verifyForm = new FormData();

            verifyForm.append(
                "file",
                repairedZip,
                "ReliGuard_Repaired_Project.zip"
            );

            const verifyResult = await requestBackend(
                "/analyze-zip",
                {
                    method: "POST",
                    body: verifyForm
                }
            );

            const verifyData = verifyResult.data;
            const remainingIssues = verifyData.issues_found ?? 0;

            const remainingFiles =
                (verifyData.results || [])
                    .filter(item => item.status === "Issue Found")
                    .map(item =>
                        item.file + ": " +
                        (item.issues || []).join(", ")
                    )
                    .join("\n");

            const report =
                "REPAIR REPORT\n\n" +
                "Status: Repair completed" +
                "\nOriginal project: Preserved" +
                "\nRepaired ZIP: Download started" +
                "\nFiles repaired: " +
                (repairedCount !== null
                    ? repairedCount
                    : "Count unavailable") +
                "\nRemaining detected issues: " +
                remainingIssues +
                "\n\nVERIFICATION:\n" +
                "The repaired ZIP was scanned again." +
                "\n\nFILES WITH REMAINING ISSUES:\n" +
                (remainingFiles || "No remaining detected issues.");

            setText(repairReport, report);
            setText(repairStatus, "Repair and verification completed!");

            setText(projectStatus, "Repair Verified");
            setText(issueCount, remainingIssues + " remaining issue(s)");

            setText(
                fixStatus,
                remainingIssues === 0
                    ? "No remaining detected issues"
                    : "Some issues still require attention"
            );

            addReportMessage("Repair Verification", report);

        } catch (error) {
            setText(
                repairStatus,
                "Repair/verification error: " + error.message
            );

            setText(
                repairReport,
                "Repair could not be fully verified.\n\n" + error.message
            );

        } finally {
            repairZipBtn.disabled = false;
            if (scanZipBtn) scanZipBtn.disabled = false;
        }
    });
}


// ------------------------------------------------------
// FEATURE 9: ATTACHMENT MENU
// ------------------------------------------------------

function closeAttachmentMenu() {
    if (attachmentMenu) {
        attachmentMenu.classList.remove("show");
    }
}

if (attachmentBtn && attachmentMenu) {
    attachmentBtn.addEventListener("click", function (event) {
        event.stopPropagation();
        attachmentMenu.classList.toggle("show");
    });

    attachmentMenu.addEventListener("click", function (event) {
        event.stopPropagation();
    });

    document.addEventListener("click", closeAttachmentMenu);
}


// ------------------------------------------------------
// FEATURE 10: ATTACHMENT OPTIONS
// ------------------------------------------------------

if (uploadCodeOption && projectFile) {
    uploadCodeOption.addEventListener("click", function () {
        closeAttachmentMenu();
        projectFile.click();
    });
}

if (uploadImageOption && imageFile) {
    uploadImageOption.addEventListener("click", function () {
        closeAttachmentMenu();
        imageFile.click();
    });
}

if (uploadZipOption && zipProjectVisible) {
    uploadZipOption.addEventListener("click", function () {
        closeAttachmentMenu();
        zipProjectVisible.click();
    });
}

if (cameraOption) {
    cameraOption.addEventListener("click", function () {
        closeAttachmentMenu();

        if (cameraSection && cameraPreview) {
            openCamera();
        } else if (cameraFile) {
            cameraFile.click();
        } else {
            addMessage("Camera is not available in this interface.");
        }
    });
}


// ------------------------------------------------------
// FEATURE 11: IMAGE TO CODE - OCR + ANALYSIS
// ------------------------------------------------------

async function extractCodeFromImage(file) {
    if (!file) return;

    addMessage("Image selected: " + file.name, "user-message");
    addMessage("Extracting code from image...");

    const formData = new FormData();
    formData.append("file", file);

    try {
        const result = await requestBackend(
            "/extract-code-image",
            {
                method: "POST",
                body: formData
            }
        );

        const data = result.data;

        const extracted =
            data.extracted_code ||
            data.extracted_text ||
            "";

        if (!extracted.trim()) {
            addMessage(
                data.message ||
                "No code could be extracted from this image."
            );
            return;
        }

        // Show extracted code in the chat input for review.
        if (chatInput) {
            chatInput.value = extracted;
            chatInput.focus();
        }

        addMessage(
            "Code extracted successfully. Review the extracted code in the message box."
        );

        // Automatically analyze the extracted code.
        addMessage("Starting code analysis on extracted text...");

        await analyzeText(extracted);

    } catch (error) {
        addMessage("Image extraction failed: " + error.message);
    }
}

if (imageFile) {
    imageFile.addEventListener("change", function () {
        const file = imageFile.files[0];

        if (file) extractCodeFromImage(file);

        imageFile.value = "";
    });
}

if (cameraFile) {
    cameraFile.addEventListener("change", function () {
        const file = cameraFile.files[0];

        if (file) extractCodeFromImage(file);

        cameraFile.value = "";
    });
}


// ------------------------------------------------------
// FEATURE 12: LIVE CAMERA
// ------------------------------------------------------

async function openCamera() {
    if (
        !navigator.mediaDevices ||
        !navigator.mediaDevices.getUserMedia
    ) {
        addMessage(
            "Camera is not supported here. Please upload an image instead."
        );
        return;
    }

    try {
        cameraStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: "environment" },
            audio: false
        });

        if (cameraPreview) {
            cameraPreview.srcObject = cameraStream;
            await cameraPreview.play();
        }

        if (cameraSection) {
            cameraSection.classList.remove("hidden");
            cameraSection.style.display = "block";
        }

    } catch (error) {
        addMessage(
            "Camera could not be opened. Check browser camera permission."
        );
    }
}

function closeCamera() {
    if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
        cameraStream = null;
    }

    if (cameraPreview) {
        cameraPreview.srcObject = null;
    }

    if (cameraSection) {
        cameraSection.style.display = "none";
    }
}

if (captureImageBtn) {
    captureImageBtn.addEventListener("click", async function () {
        if (!cameraPreview || !cameraCanvas || !cameraStream) {
            addMessage("Open the camera before capturing an image.");
            return;
        }

        const width = cameraPreview.videoWidth;
        const height = cameraPreview.videoHeight;

        if (!width || !height) {
            addMessage("Camera is not ready yet.");
            return;
        }

        cameraCanvas.width = width;
        cameraCanvas.height = height;

        const context = cameraCanvas.getContext("2d");

        context.drawImage(
            cameraPreview,
            0,
            0,
            width,
            height
        );

        cameraCanvas.toBlob(async function (blob) {
            if (!blob) {
                addMessage("Image capture failed.");
                return;
            }

            const image = new File(
                [blob],
                "camera_code_capture.png",
                { type: "image/png" }
            );

            closeCamera();
            await extractCodeFromImage(image);

        }, "image/png");
    });
}

if (closeCameraBtn) {
    closeCameraBtn.addEventListener("click", closeCamera);
}


// ------------------------------------------------------
// FEATURE 13: CHAT TEXT ANALYSIS
// ------------------------------------------------------

async function analyzeText(code) {
    pendingChatCode = code;
    pendingChatFilename = "pasted_code.py";

    addMessage("Analyzing submitted code...");

    try {
        const result = await requestBackend("/analyze-text", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                filename: pendingChatFilename,
                code: code
            })
        });

        const data = result.data;
        const analysis = data.results?.[0];

        if (!analysis) {
            throw new Error("No analysis result returned.");
        }

        const issues = analysis.issues || [];

        const report =
            "File: " + (analysis.file || pendingChatFilename) +
            "\nStatus: " + analysis.status +
            "\n\nDetected issues:\n" +
            (issues.length ? issues.join("\n") : "No issues detected.") +
            "\n\nSuggested fix:\n" +
            (analysis.suggested_fix || "No suggested fix available.");

        const resultMessage = addReportMessage(
            "Code Analysis Result",
            report
        );

        setText(projectStatus, analysis.status);
        setText(issueCount, issues.length + " reported issue(s)");

        if (analysisOutput) {
            analysisOutput.textContent = report;
        }

        // Display backend-verified corrected code if available.
        if (
            analysis.auto_fix_available &&
            analysis.corrected_code &&
            resultMessage
        ) {
            displayCorrectedCode(
                analysis,
                resultMessage,
                "pasted_code.py"
            );
        } else {
            setText(
                fixStatus,
                "No supported automatic correction for this issue"
            );
        }

        // Approval-based correction using the backend endpoint.
        const canOfferFix =
            analysis.status === "Issue Found" &&
            issues.some(issue =>
                issue.toLowerCase().includes("syntax error")
            );

        if (
            canOfferFix &&
            !analysis.corrected_code &&
            resultMessage
        ) {
            const fixButton = document.createElement("button");

            fixButton.type = "button";
            fixButton.textContent = "Apply Supported Fix";
            fixButton.className = "send-btn";
            fixButton.style.marginTop = "12px";
            fixButton.style.padding = "10px 18px";

            resultMessage.appendChild(fixButton);

            fixButton.addEventListener("click", async function () {
                const approved = confirm(
                    "Apply the supported Python correction?\n\n" +
                    "A corrected copy will be downloaded. " +
                    "Your original code will remain unchanged."
                );

                if (!approved) return;

                fixButton.disabled = true;
                fixButton.textContent = "Applying correction...";

                try {
                    const formData = new FormData();

                    const sourceFile = new File(
                        [pendingChatCode],
                        pendingChatFilename,
                        { type: "text/x-python" }
                    );

                    formData.append("file", sourceFile);

                    const fixResult = await requestBackend(
                        "/apply-fix?approved=true",
                        {
                            method: "POST",
                            body: formData
                        }
                    );

                    const fixData = fixResult.data;

                    if (
                        fixData.status !== "Fix Applied" ||
                        !fixData.corrected_code
                    ) {
                        throw new Error(
                            fixData.message ||
                            "Correction could not be applied."
                        );
                    }

                    const correctedMessage = document.createElement("div");
                    correctedMessage.className = "chat-message bot-message";

                    const heading = document.createElement("h3");
                    heading.textContent = "Corrected Python Code";

                    correctedMessage.appendChild(heading);
                    chatMessages.appendChild(correctedMessage);

                    showCorrectedCode(
                        correctedMessage,
                        fixData.corrected_code,
                        fixData.corrected_filename || "pasted_code_corrected.py"
                    );

                    fixButton.textContent = "Correction Downloaded";

                    setText(fixStatus, "Corrected copy downloaded");

                    addMessage(
                        "Correction completed. Your original code was preserved."
                    );

                } catch (error) {
                    fixButton.disabled = false;
                    fixButton.textContent = "Try Apply Fix Again";

                    addMessage("Correction failed: " + error.message);
                }
            });
        }

    } catch (error) {
        addMessage("Text analysis failed: " + error.message);
    }
}


// ------------------------------------------------------
// FEATURE 14: SEND CHAT MESSAGE
// ------------------------------------------------------

async function sendChatMessage() {
    if (!chatInput) return;

    const message = chatInput.value.trim();
    if (!message) return;

    addMessage(message, "user-message");
    chatInput.value = "";

    if (sendBtn) sendBtn.disabled = true;

    try {
        await analyzeText(message);
    } finally {
        if (sendBtn) sendBtn.disabled = false;
    }
}

if (sendBtn) {
    sendBtn.addEventListener("click", sendChatMessage);
}

if (chatInput) {
    chatInput.addEventListener("keydown", function (event) {
        if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            sendChatMessage();
        }
    });
}


// ------------------------------------------------------
// FEATURE 15: MICROPHONE INPUT
// ------------------------------------------------------

if (micBtn) {
    micBtn.addEventListener("click", function () {
        const SpeechRecognition =
            window.SpeechRecognition ||
            window.webkitSpeechRecognition;

        if (!SpeechRecognition) {
            addMessage("Voice input is not supported in this browser.");
            return;
        }

        const recognition = new SpeechRecognition();

        recognition.lang = "en-IN";
        recognition.continuous = false;
        recognition.interimResults = false;

        micBtn.disabled = true;

        recognition.onresult = function (event) {
            const transcript = event.results[0][0].transcript;

            if (chatInput) {
                chatInput.value =
                    (chatInput.value + " " + transcript).trim();
            }
        };

        recognition.onerror = function () {
            addMessage(
                "Voice recognition could not complete. Please try again."
            );
        };

        recognition.onend = function () {
            micBtn.disabled = false;
        };

        recognition.start();
    });
}


// ------------------------------------------------------
// FEATURE 16: QUICK ACTIONS
// ------------------------------------------------------

if (quickAnalyze && projectFile) {
    quickAnalyze.addEventListener("click", function () {
        projectFile.click();
    });
}

if (quickProject && zipProjectVisible) {
    quickProject.addEventListener("click", function () {
        zipProjectVisible.click();
    });
}

if (quickImage && imageFile) {
    quickImage.addEventListener("click", function () {
        imageFile.click();
    });
}


// ------------------------------------------------------
// FEATURE 17: NEW ANALYSIS
// ------------------------------------------------------

if (newChatBtn) {
    newChatBtn.addEventListener("click", function () {
        if (chatMessages) chatMessages.innerHTML = "";

        if (chatInput) {
            chatInput.value = "";
            chatInput.focus();
        }

        if (analysisOutput) {
            analysisOutput.textContent = "Ready for a new analysis.";
        }

        setText(projectStatus, "Ready");
        setText(issueCount, "0");
        setText(fixStatus, "Not generated");
        setText(fileStatus, "No files selected yet.");

        fileToFix = null;
        selectedCodeFiles = [];
        pendingChatCode = "";

        if (projectFile) projectFile.value = "";

        if (applyFixBtn) applyFixBtn.disabled = true;

        addMessage(
            "New analysis started. Upload your code or project."
        );
    });
}


// ------------------------------------------------------
// FEATURE 18: SIDEBAR NAVIGATION
// ------------------------------------------------------

if (scannerButton) {
    scannerButton.style.cursor = "pointer";

    scannerButton.addEventListener("click", function () {
        document.getElementById("projectScanner")?.scrollIntoView({
            behavior: "smooth",
            block: "start"
        });
    });
}

if (repairButton) {
    repairButton.style.cursor = "pointer";

    repairButton.addEventListener("click", function () {
        document.getElementById("repairSection")?.scrollIntoView({
            behavior: "smooth",
            block: "center"
        });
    });
}

document.querySelectorAll(".sidebar-item").forEach(function (item) {
    if (item.textContent.trim().includes("Code Assistant")) {
        item.style.cursor = "pointer";

        item.addEventListener("click", function () {
            chatInput?.focus();

            document.querySelector(".chat-workspace")?.scrollIntoView({
                behavior: "smooth"
            });
        });
    }
});


// ------------------------------------------------------
// INITIAL APPLICATION STATE
// ------------------------------------------------------

if (applyFixBtn) applyFixBtn.disabled = true;
if (repairZipBtn) repairZipBtn.disabled = true;

if (cameraSection) {
    cameraSection.style.display = "none";
}

addMessage(
    "Hello! I'm ReliGuard AI Engineering Assistant. " +
    "Upload code, a project ZIP, a code image, or paste code to begin."
);

console.log(
    "ReliGuard AI 2.0 Engineering Module Loaded Successfully."
);
