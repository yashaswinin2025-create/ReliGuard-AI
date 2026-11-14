
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

import ast
import json
import zipfile
import io
import re

from pathlib import PurePosixPath
from html.parser import HTMLParser
from typing import List


# =====================================================
# APPLICATION
# =====================================================

app = FastAPI(
    title="ReliGuard AI Engineering",
    description="Engineering code analysis and project diagnostics",
    version="2.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Repaired-Files"]
)


# =====================================================
# SECURITY AND SIZE LIMITS
# =====================================================

MAX_UPLOAD_SIZE = 10_000_000
MAX_FILE_SIZE = 1_000_000
MAX_ZIP_ENTRIES = 100
MAX_EXTRACTED_SIZE = 10_000_000
MAX_IMAGE_SIZE = 5_000_000

SUPPORTED_EXTENSIONS = {
    ".py", ".js", ".html", ".css",
    ".java", ".cpp", ".c", ".json", ".txt"
}

SUPPORTED_LANGUAGES = {
    ".py": "Python",
    ".js": "JavaScript",
    ".html": "HTML",
    ".css": "CSS",
    ".java": "Java",
    ".cpp": "C++",
    ".c": "C",
    ".json": "JSON",
    ".txt": "Text"
}


# =====================================================
# OPTIONAL OCR SUPPORT
# =====================================================

try:
    from PIL import Image, ImageEnhance, ImageFilter
    import pytesseract

    OCR_AVAILABLE = True

except ImportError:
    OCR_AVAILABLE = False


# =====================================================
# CHAT REQUEST MODEL
# =====================================================

class CodeRequest(BaseModel):
    filename: str = "pasted_code.py"
    code: str


# =====================================================
# SAFE ZIP PATH VALIDATION
# =====================================================

def is_safe_zip_entry(item):

    safe_name = item.filename.replace("\\", "/")
    path = PurePosixPath(safe_name)

    is_symlink = (
        (item.external_attr >> 16) & 0o170000
    ) == 0o120000

    if (
        path.is_absolute()
        or ".." in path.parts
        or not path.parts
        or item.filename.startswith("\\")
        or (path.parts and ":" in path.parts[0])
        or is_symlink
    ):
        return False

    return True


# =====================================================
# CODE DELIMITER CHECKER
# =====================================================

def check_delimiters(source):

    stack = []

    pairs = {
        ")": "(",
        "]": "[",
        "}": "{"
    }

    quote = None
    escaped = False
    line_comment = False
    block_comment = False

    i = 0

    while i < len(source):

        char = source[i]

        next_char = (
            source[i + 1]
            if i + 1 < len(source)
            else ""
        )

        if line_comment:

            if char == "\n":
                line_comment = False

            i += 1
            continue

        if block_comment:

            if char == "*" and next_char == "/":
                block_comment = False
                i += 2
                continue

            i += 1
            continue

        if quote:

            if escaped:
                escaped = False

            elif char == "\\":
                escaped = True

            elif char == quote:
                quote = None

            i += 1
            continue

        if char in ("'", '"', "`"):
            quote = char
            i += 1
            continue

        if char == "/" and next_char == "/":
            line_comment = True
            i += 2
            continue

        if char == "/" and next_char == "*":
            block_comment = True
            i += 2
            continue

        if char in "([{":
            stack.append(char)

        elif char in ")]}":

            if not stack:
                return f"Unexpected closing delimiter '{char}'."

            opening = stack.pop()

            if opening != pairs[char]:

                return (
                    f"Mismatched delimiters: "
                    f"'{opening}' and '{char}'."
                )

        i += 1

    if quote:
        return "A string may be missing its closing quotation mark."

    if block_comment:
        return "A block comment may be missing its closing marker."

    if stack:
        return f"Missing closing delimiter for '{stack[-1]}'."

    return None


# =====================================================
# PYTHON AUTOMATIC CORRECTION
# =====================================================

def correct_missing_colon(source):

    try:
        ast.parse(source)
        return source, False

    except SyntaxError as error:

        if error.msg != "expected ':'" or not error.lineno:
            return source, False

        lines = source.splitlines()
        index = error.lineno - 1

        if index >= len(lines):
            return source, False

        original_line = lines[index]
        stripped = original_line.strip()

        supported_headers = (
            "def ", "class ", "if ", "elif ",
            "else", "for ", "while ", "try",
            "except", "finally", "with "
        )

        if not stripped.startswith(supported_headers):
            return source, False

        if stripped.endswith(":"):
            return source, False

        lines[index] = original_line + ":"

        corrected_source = "\n".join(lines)

        try:
            ast.parse(corrected_source)
            return corrected_source, True

        except SyntaxError:
            return source, False


# =====================================================
# HTML STRUCTURE CHECK
# =====================================================

class BasicHTMLChecker(HTMLParser):

    VOID_TAGS = {
        "area", "base", "br", "col", "embed",
        "hr", "img", "input", "link", "meta",
        "param", "source", "track", "wbr"
    }

    def __init__(self):

        super().__init__()

        self.stack = []
        self.errors = []

    def handle_starttag(self, tag, attrs):

        if tag not in self.VOID_TAGS:
            self.stack.append(tag)

    def handle_startendtag(self, tag, attrs):
        pass

    def handle_endtag(self, tag):

        if tag in self.VOID_TAGS:
            return

        if not self.stack:

            self.errors.append(
                f"Unexpected closing HTML tag: </{tag}>"
            )

            return

        if self.stack[-1] == tag:
            self.stack.pop()
            return

        if tag in self.stack:

            self.errors.append(
                f"HTML tag nesting mismatch near </{tag}>."
            )

            while self.stack:

                current = self.stack.pop()

                if current == tag:
                    break

        else:

            self.errors.append(
                f"Closing HTML tag </{tag}> has no matching opening tag."
            )


# =====================================================
# MULTI-LANGUAGE ANALYZER
# =====================================================

def analyze_source(filename, source):

    extension = PurePosixPath(filename).suffix.lower()

    result = {
        "file": filename,
        "language": SUPPORTED_LANGUAGES.get(
            extension, "Unknown"
        ),
        "status": "Checked",
        "issues": [],
        "suggested_fix": "",
        "corrected_code": None,
        "auto_fix_available": False,
        "analysis_type": "Static analysis"
    }

    # -------------------------------------------------
    # PYTHON
    # -------------------------------------------------

    if extension == ".py":

        try:

            ast.parse(source)

            result["issues"].append(
                "Python syntax validation passed."
            )

            result["corrected_code"] = source

        except SyntaxError as error:

            result["status"] = "Issue Found"

            result["issues"].append(
                f"Python syntax error on line "
                f"{error.lineno}: {error.msg}"
            )

            corrected_source, changed = (
                correct_missing_colon(source)
            )

            if changed:

                result["suggested_fix"] = (
                    "A missing colon was detected and corrected. "
                    "The corrected code passed Python syntax validation."
                )

                result["corrected_code"] = corrected_source
                result["auto_fix_available"] = True

            else:

                result["suggested_fix"] = (
                    f"Review line {error.lineno}. "
                    f"Python reported: {error.msg}. "
                    "An automatic correction could not be verified."
                )

    # -------------------------------------------------
    # JAVASCRIPT
    # -------------------------------------------------

    elif extension == ".js":

        error = check_delimiters(source)

        if error:

            result["status"] = "Issue Found"

            result["issues"].append(
                f"JavaScript structure issue: {error}"
            )

            result["suggested_fix"] = (
                "Check brackets, parentheses and quotation marks."
            )

        else:

            result["issues"].append(
                "JavaScript delimiter check passed."
            )

        if re.search(r"\bfetch\s*\(", source):

            if not re.search(r"\bcatch\s*\(", source):

                result["status"] = "Potential Issue"

                result["issues"].append(
                    "A network request was detected without "
                    "a visible catch block."
                )

                result["suggested_fix"] = (
                    "Consider adding error handling around "
                    "the network request."
                )

            if not re.search(r"\.ok\b", source):

                result["status"] = "Potential Issue"

                result["issues"].append(
                    "The response status is not visibly checked "
                    "using response.ok."
                )

    # -------------------------------------------------
    # JAVA
    # -------------------------------------------------

    elif extension == ".java":

        error = check_delimiters(source)

        if error:

            result["status"] = "Issue Found"

            result["issues"].append(
                f"Java structure issue: {error}"
            )

        else:

            result["issues"].append(
                "Java delimiter check passed. "
                "Java compilation has not been performed."
            )

        public_class = re.search(
            r"\bpublic\s+class\s+(\w+)", source
        )

        if public_class:

            expected_name = public_class.group(1) + ".java"
            actual_name = PurePosixPath(filename).name

            if actual_name != expected_name:

                result["status"] = "Potential Issue"

                result["issues"].append(
                    f"Public class name suggests the filename "
                    f"should be {expected_name}."
                )

    # -------------------------------------------------
    # C AND C++
    # -------------------------------------------------

    elif extension in (".c", ".cpp"):

        error = check_delimiters(source)

        if error:

            result["status"] = "Issue Found"

            result["issues"].append(
                f"Code structure issue: {error}"
            )

        else:

            result["issues"].append(
                "Delimiter check passed. "
                "Full compilation has not been performed."
            )

    # -------------------------------------------------
    # CSS
    # -------------------------------------------------

    elif extension == ".css":

        error = check_delimiters(source)

        if error:

            result["status"] = "Issue Found"

            result["issues"].append(
                f"CSS structure issue: {error}"
            )

            result["suggested_fix"] = (
                "Check CSS braces and quotation marks."
            )

        else:

            result["issues"].append(
                "CSS delimiter check passed."
            )

    # -------------------------------------------------
    # HTML
    # -------------------------------------------------

    elif extension == ".html":

        try:

            parser = BasicHTMLChecker()

            parser.feed(source)
            parser.close()

            if parser.errors:

                result["status"] = "Potential Issue"

                result["issues"].extend(
                    parser.errors[:10]
                )

                result["suggested_fix"] = (
                    "Review the reported HTML tag structure."
                )

            elif parser.stack:

                result["status"] = "Potential Issue"

                result["issues"].append(
                    "Some HTML tags appear to be unclosed: "
                    + ", ".join(parser.stack[-5:])
                )

                result["suggested_fix"] = (
                    "Add the appropriate closing HTML tags."
                )

            else:

                result["issues"].append(
                    "Basic HTML tag structure check passed."
                )

        except Exception as error:

            result["status"] = "Issue Found"

            result["issues"].append(
                f"HTML parsing issue: {str(error)}"
            )

    # -------------------------------------------------
    # JSON
    # -------------------------------------------------

    elif extension == ".json":

        try:

            json.loads(source)

            result["issues"].append(
                "Valid JSON formatting found."
            )

        except json.JSONDecodeError as error:

            result["status"] = "Issue Found"

            result["issues"].append(
                f"JSON error on line {error.lineno}: {error.msg}"
            )

            result["suggested_fix"] = (
                "Check commas, quotation marks, brackets "
                "and JSON values."
            )

    # -------------------------------------------------
    # TEXT
    # -------------------------------------------------

    elif extension == ".txt":

        result["issues"].append(
            "Text file identified. No code analysis required."
        )

    else:

        result["status"] = "Skipped"

        result["issues"].append(
            "This file type is not currently supported."
        )

    return result


# =====================================================
# RESULT SUMMARY
# =====================================================

def summarize_results(results):

    return {
        "total_files": len(results),

        "issues_found": sum(
            1 for item in results
            if item["status"] in (
                "Issue Found", "Potential Issue"
            )
        ),

        "files_checked": sum(
            1 for item in results
            if item["status"] == "Checked"
        ),

        "files_skipped": sum(
            1 for item in results
            if item["status"] == "Skipped"
        )
    }


# =====================================================
# HOME AND HEALTH
# =====================================================

@app.get("/")
def home():

    return {
        "project": "ReliGuard AI Engineering",
        "version": "2.0",
        "status": "Running",

        "supported_languages": list(
            SUPPORTED_LANGUAGES.values()
        ),

        "features": [
            "Single Python file analysis",
            "Multiple file analysis",
            "ZIP project analysis",
            "Approval-based Python repair",
            "ZIP project repair",
            "Chat code analysis",
            "Image OCR extraction"
        ],

        "ocr_available": OCR_AVAILABLE
    }


@app.get("/health")
def health():

    return {
        "status": "Healthy",
        "backend": "ReliGuard AI Engineering",
        "ocr_available": OCR_AVAILABLE
    }


# =====================================================
# FEATURE 1: SINGLE FILE ANALYSIS
# =====================================================

@app.post("/analyze")
async def analyze_project(file: UploadFile = File(...)):

    if not file.filename:

        raise HTTPException(
            status_code=400,
            detail="Filename is required."
        )

    content = await file.read()

    if len(content) > MAX_FILE_SIZE:

        return {
            "file": file.filename,
            "status": "Skipped",
            "issues": ["File exceeds 1 MB limit."]
        }

    try:

        source = content.decode("utf-8")

    except UnicodeDecodeError:

        return {
            "project": "ReliGuard AI 2.0",
            "total_files": 1,
            "results": [{
                "file": file.filename,
                "status": "Skipped",
                "issues": [
                    "File is not valid UTF-8 text."
                ]
            }]
        }

    result = analyze_source(
        file.filename,
        source
    )

    return {
        "project": "ReliGuard AI 2.0",
        "total_files": 1,
        "results": [result]
    }


# =====================================================
# FEATURE 2: MULTIPLE FILE ANALYSIS
# =====================================================

@app.post("/analyze-multiple")
async def analyze_multiple(
    files: List[UploadFile] = File(...)
):

    if not files:

        raise HTTPException(
            status_code=400,
            detail="Please upload at least one file."
        )

    if len(files) > 20:

        raise HTTPException(
            status_code=400,
            detail="Maximum 20 files are allowed."
        )

    results = []

    for uploaded_file in files:

        filename = uploaded_file.filename or "unknown.txt"

        content = await uploaded_file.read()

        if len(content) > MAX_FILE_SIZE:

            results.append({
                "file": filename,
                "status": "Skipped",
                "issues": ["File exceeds 1 MB limit."]
            })

            continue

        try:

            source = content.decode("utf-8")

        except UnicodeDecodeError:

            results.append({
                "file": filename,
                "status": "Skipped",
                "issues": [
                    "File is not valid UTF-8 text."
                ]
            })

            continue

        results.append(
            analyze_source(filename, source)
        )

    return {
        "project": "ReliGuard AI 2.0",
        "status": "Analysis Complete",
        "summary": summarize_results(results),
        "results": results
    }


# =====================================================
# FEATURE 3: CHAT-BASED CODE ANALYSIS
# =====================================================

@app.post("/analyze-text")
async def analyze_text(request: CodeRequest):

    if not request.code.strip():

        raise HTTPException(
            status_code=400,
            detail="Please enter some code."
        )

    if len(request.code.encode("utf-8")) > MAX_FILE_SIZE:

        raise HTTPException(
            status_code=413,
            detail="Code exceeds the 1 MB limit."
        )

    filename = PurePosixPath(
        request.filename
    ).name

    if not filename:
        filename = "pasted_code.py"

    result = analyze_source(
        filename,
        request.code
    )

    return {
        "project": "ReliGuard AI 2.0",
        "status": "Analysis Complete",
        "response": (
            "Code analysis completed. "
            "Review the findings and suggested corrections."
        ),
        "results": [result]
    }


# =====================================================
# FEATURE 4: APPROVAL-BASED SINGLE FILE FIX
# =====================================================

@app.post("/apply-fix")
async def apply_fix(
    file: UploadFile = File(...),
    approved: bool = False
):

    if not file.filename:

        raise HTTPException(
            status_code=400,
            detail="Filename is required."
        )

    content = await file.read()

    if len(content) > MAX_FILE_SIZE:

        return {
            "status": "Skipped",
            "message": "File exceeds 1 MB limit."
        }

    if not file.filename.lower().endswith(".py"):

        return {
            "status": "Fix Not Supported",
            "message": (
                "Verified automatic correction is currently "
                "available only for supported Python syntax errors."
            )
        }

    try:

        source = content.decode("utf-8")

    except UnicodeDecodeError:

        return {
            "status": "Fix Failed",
            "message": "Invalid UTF-8 text file."
        }

    if not approved:

        return {
            "status": "Approval Required",
            "message": "Please approve the suggested fix first."
        }

    corrected_source, changed = correct_missing_colon(source)

    if not changed:

        return {
            "status": "Fix Failed",
            "message": (
                "No supported automatic correction "
                "could be verified."
            )
        }

    return {
        "status": "Fix Applied",
        "message": "A corrected copy is ready.",
        "corrected_code": corrected_source,
        "corrected_filename": (
            PurePosixPath(file.filename).stem
            + "_corrected.py"
        )
    }


# =====================================================
# FEATURE 5: IMAGE TO CODE OCR
# =====================================================

@app.post("/extract-code-image")
async def extract_code_image(
    file: UploadFile = File(...)
):

    if not OCR_AVAILABLE:

        return {
            "status": "OCR Unavailable",
            "message": (
                "Install Pillow and pytesseract, "
                "and install the Tesseract OCR application."
            )
        }

    if (
        not file.content_type
        or not file.content_type.startswith("image/")
    ):

        raise HTTPException(
            status_code=400,
            detail="Please upload a valid image."
        )

    image_data = await file.read()

    if len(image_data) > MAX_IMAGE_SIZE:

        raise HTTPException(
            status_code=413,
            detail="Image exceeds the 5 MB limit."
        )

    try:

        image_file = Image.open(
            io.BytesIO(image_data)
        )

        image_file.verify()

        image_file = Image.open(
            io.BytesIO(image_data)
        )

        if (
            image_file.width > 4000
            or image_file.height > 4000
        ):

            raise HTTPException(
                status_code=400,
                detail="Image dimensions are too large."
            )

        processed_image = image_file.convert("RGB")

        processed_image = processed_image.resize(
            (
                processed_image.width * 2,
                processed_image.height * 2
            )
        )

        processed_image = ImageEnhance.Contrast(
            processed_image
        ).enhance(1.8)

        processed_image = processed_image.filter(
            ImageFilter.SHARPEN
        )

        extracted_text = pytesseract.image_to_string(
            processed_image,
            config="--oem 3 --psm 6"
        )

        if not extracted_text.strip():

            return {
                "status": "No Text Found",
                "extracted_code": "",
                "message": (
                    "No readable text was detected. "
                    "Try a clearer image."
                )
            }

        return {
            "status": "OCR Complete",
            "filename": file.filename,
            "extracted_code": extracted_text,
            "message": (
                "Code text extracted successfully. "
                "Review the extracted text before analysis."
            )
        }

    except HTTPException:
        raise

    except Exception:

        return {
            "status": "OCR Failed",
            "message": (
                "Could not process this image. "
                "Check that Tesseract is installed and "
                "try another clear image."
            )
        }


# =====================================================
# FEATURE 6: FULL PROJECT ZIP ANALYSIS
# =====================================================

@app.post("/analyze-zip")
async def analyze_zip(file: UploadFile = File(...)):

    if (
        not file.filename
        or not file.filename.lower().endswith(".zip")
    ):

        return {
            "status": "Error",
            "message": "Please upload a ZIP project file."
        }

    content = await file.read()

    if len(content) > MAX_UPLOAD_SIZE:

        return {
            "status": "Error",
            "message": "ZIP file exceeds the 10 MB limit."
        }

    try:

        archive = zipfile.ZipFile(
            io.BytesIO(content)
        )

    except zipfile.BadZipFile:

        return {
            "status": "Error",
            "message": "Invalid or damaged ZIP file."
        }

    results = []
    project_structure = []
    total_uncompressed = 0

    try:

        entries = archive.infolist()

        if len(entries) > MAX_ZIP_ENTRIES:

            return {
                "status": "Error",
                "message": "Project contains too many ZIP entries."
            }

        for item in entries:

            if not is_safe_zip_entry(item):

                results.append({
                    "file": item.filename,
                    "status": "Skipped",
                    "issues": [
                        "Unsafe ZIP path was rejected."
                    ]
                })

                continue

            if item.is_dir():
                continue

            safe_name = item.filename.replace("\\", "/")

            if item.flag_bits & 0x1:

                results.append({
                    "file": safe_name,
                    "status": "Skipped",
                    "issues": [
                        "Encrypted files are not supported."
                    ]
                })

                continue

            total_uncompressed += item.file_size

            if item.file_size > MAX_FILE_SIZE:

                results.append({
                    "file": safe_name,
                    "status": "Skipped",
                    "issues": [
                        "File exceeds 1 MB limit."
                    ]
                })

                continue

            if total_uncompressed > MAX_EXTRACTED_SIZE:

                results.append({
                    "file": safe_name,
                    "status": "Skipped",
                    "issues": [
                        "Project exceeds the 10 MB extracted limit."
                    ]
                })

                break

            project_structure.append(safe_name)

            extension = PurePosixPath(
                safe_name
            ).suffix.lower()

            if extension not in SUPPORTED_EXTENSIONS:
                continue

            try:

                file_content = archive.read(item)
                source = file_content.decode("utf-8")

            except (
                UnicodeDecodeError,
                RuntimeError,
                zipfile.BadZipFile
            ):

                results.append({
                    "file": safe_name,
                    "status": "Skipped",
                    "issues": [
                        "File could not be read as UTF-8 text."
                    ]
                })

                continue

            results.append(
                analyze_source(safe_name, source)
            )

    finally:

        archive.close()

    summary = summarize_results(results)

    return {
        "project": "ReliGuard AI 2.0",
        "status": "Analysis Complete",
        "total_project_files": len(project_structure),
        "total_files_analyzed": summary["total_files"],
        "issues_found": summary["issues_found"],
        "project_structure": project_structure,
        "summary": summary,
        "results": results
    }


# =====================================================
# FEATURE 7: APPROVAL-BASED FULL PROJECT ZIP REPAIR
# =====================================================

@app.post("/repair-zip")
async def repair_zip_project(
    file: UploadFile = File(...),
    approved: bool = False
):

    if not approved:

        return {
            "status": "Approval Required",
            "message": "Approve the project repair first."
        }

    if (
        not file.filename
        or not file.filename.lower().endswith(".zip")
    ):

        return {
            "status": "Error",
            "message": "Please upload a ZIP project."
        }

    uploaded_data = await file.read()

    if len(uploaded_data) > MAX_UPLOAD_SIZE:

        return {
            "status": "Error",
            "message": "ZIP file exceeds the 10 MB limit."
        }

    try:

        source_zip = zipfile.ZipFile(
            io.BytesIO(uploaded_data)
        )

    except zipfile.BadZipFile:

        return {
            "status": "Error",
            "message": "Invalid or damaged ZIP file."
        }

    output_zip = io.BytesIO()

    repaired_files = 0
    total_uncompressed = 0

    try:

        entries = source_zip.infolist()

        if len(entries) > MAX_ZIP_ENTRIES:

            return {
                "status": "Error",
                "message": "Project contains too many ZIP entries."
            }

        with zipfile.ZipFile(
            output_zip,
            "w",
            zipfile.ZIP_DEFLATED
        ) as repaired_archive:

            for item in entries:

                if not is_safe_zip_entry(item):

                    return {
                        "status": "Error",
                        "message": (
                            "ZIP contains an unsafe file path."
                        )
                    }

                if item.is_dir():

                    repaired_archive.writestr(
                        item,
                        b""
                    )

                    continue

                if item.flag_bits & 0x1:

                    return {
                        "status": "Error",
                        "message": (
                            "Encrypted files are not supported."
                        )
                    }

                total_uncompressed += item.file_size

                if item.file_size > MAX_FILE_SIZE:

                    return {
                        "status": "Error",
                        "message": (
                            "A project file exceeds the 1 MB limit."
                        )
                    }

                if total_uncompressed > MAX_EXTRACTED_SIZE:

                    return {
                        "status": "Error",
                        "message": (
                            "Project exceeds the extracted size limit."
                        )
                    }

                content = source_zip.read(item)

                extension = PurePosixPath(
                    item.filename.replace("\\", "/")
                ).suffix.lower()

                if extension == ".py":

                    try:

                        source_code = content.decode("utf-8")

                        corrected_code, changed = (
                            correct_missing_colon(source_code)
                        )

                        if changed:

                            content = corrected_code.encode("utf-8")
                            repaired_files += 1

                    except UnicodeDecodeError:
                        pass

                repaired_archive.writestr(
                    item,
                    content
                )

        if repaired_files == 0:

            return {
                "status": "No Changes",
                "message": (
                    "No supported Python syntax corrections "
                    "were found. Other language files are preserved "
                    "but are not automatically repaired."
                )
            }

        output_zip.seek(0)

        return StreamingResponse(
            output_zip,
            media_type="application/zip",
            headers={
                "Content-Disposition":
                    'attachment; filename="ReliGuard_Repaired_Project.zip"',
                "X-Repaired-Files": str(repaired_files)
            }
        )

    except (
        zipfile.BadZipFile,
        RuntimeError,
        OSError
    ):

        return {
            "status": "Error",
            "message": (
                "Could not safely process this ZIP project."
            )
        }

    finally:

        source_zip.close()
