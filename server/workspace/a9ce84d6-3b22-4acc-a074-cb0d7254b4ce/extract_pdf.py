
import sys
sys.path.append('/opt/homebrew/lib/python3.11/site-packages')

try:
    import pdfplumber
    
    with pdfplumber.open('/Users/maverickshaw/Projects/Samantha/server/workspace/a9ce84d6-3b22-4acc-a074-cb0d7254b4ce/profile.pdf') as pdf:
        full_text = ""
        for page_num, page in enumerate(pdf.pages):
            text = page.extract_text()
            if text:
                full_text += f"=== PAGE {page_num + 1} ===\n"
                full_text += text
                full_text += "\n\n"
        
        print(full_text)
        
except ImportError as e:
    print(f"Error importing pdfplumber: {e}")
    # Try alternative approach with PyPDF2
    try:
        from PyPDF2 import PdfReader
        
        reader = PdfReader('/Users/maverickshaw/Projects/Samantha/server/workspace/a9ce84d6-3b22-4acc-a074-cb0d7254b4ce/profile.pdf')
        full_text = ""
        
        for page_num, page in enumerate(reader.pages):
            text = page.extract_text()
            if text:
                full_text += f"=== PAGE {page_num + 1} ===\n"
                full_text += text
                full_text += "\n\n"
        
        print(full_text)
        
    except ImportError:
        print("Neither pdfplumber nor PyPDF2 available")
        
except Exception as e:
    print(f"Error reading PDF: {e}")
