
const projectFile = document.getElementById("projectFile");
const analyzeBtn = document.getElementById("analyzeBtn");
const fileStatus = document.getElementById("fileStatus");
const projectStatus = document.getElementById("projectStatus");
const issueCount = document.getElementById("issueCount");
const fixStatus = document.getElementById("fixStatus");
const analysisOutput = document.getElementById("analysisOutput");

projectFile.addEventListener("change", function () {
    const files = projectFile.files;

    if (files.length === 0) {
        fileStatus.textContent = "No files selected yet.";
        return;
    }

    fileStatus.textContent = files.length + " file(s) selected.";
});

analyzeBtn.addEventListener("click", function () {
    if (projectFile.files.length === 0) {
        alert("Please select your project files first.");
        return;
    }

    projectStatus.textContent = "Files ready for analysis";
    issueCount.textContent = "Waiting for backend";
    fixStatus.textContent = "Not generated yet";

    analysisOutput.innerHTML =
        "<p>Your files are selected successfully. " +
        "Connect the FastAPI backend to begin real project analysis.</p>";
});
