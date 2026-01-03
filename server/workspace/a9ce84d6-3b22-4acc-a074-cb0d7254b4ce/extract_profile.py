
#!/usr/bin/env python3
import sys
import os

pdf_path = "/Users/maverickshaw/Projects/Samantha/server/workspace/a9ce84d6-3b22-4acc-a074-cb0d7254b4ce/profile.pdf"
print(f"Trying to process PDF: {pdf_path}")
print(f"File exists: {os.path.exists(pdf_path)}")

if os.path.exists(pdf_path):
    print(f"File size: {os.path.getsize(pdf_path)} bytes")

# Try different PDF libraries
libraries_to_try = ['pypdf', 'PyPDF2', 'pdfplumber']

for lib in libraries_to_try:
    try:
        if lib == 'pypdf':
            from pypdf import PdfReader
            reader = PdfReader(pdf_path)
            text = ""
            for i, page in enumerate(reader.pages):
                page_text = page.extract_text()
                text += f"=== PAGE {i+1} ===\n{page_text}\n\n"
            print(f"SUCCESS with {lib}:")
            print(text)
            break
        elif lib == 'PyPDF2':
            import PyPDF2
            with open(pdf_path, 'rb') as file:
                pdf_reader = PyPDF2.PdfReader(file)
                text = ""
                for i, page in enumerate(pdf_reader.pages):
                    page_text = page.extract_text()
                    text += f"=== PAGE {i+1} ===\n{page_text}\n\n"
            print(f"SUCCESS with {lib}:")
            print(text)
            break
        elif lib == 'pdfplumber':
            import pdfplumber
            with pdfplumber.open(pdf_path) as pdf:
                text = ""
                for i, page in enumerate(pdf.pages):
                    page_text = page.extract_text()
                    if page_text:
                        text += f"=== PAGE {i+1} ===\n{page_text}\n\n"
            print(f"SUCCESS with {lib}:")
            print(text)
            break
    except ImportError:
        print(f"{lib} not available")
        continue
    except Exception as e:
        print(f"Error with {lib}: {e}")
        continue

print("Finished trying all libraries")
