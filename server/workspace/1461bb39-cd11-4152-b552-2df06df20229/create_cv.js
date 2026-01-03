const { Document, Packer, Paragraph, TextRun, AlignmentType, WidthType, LevelFormat } = require('docx');
const fs = require('fs');
const path = require('path');

const doc = new Document({
  styles: {
    default: { 
      document: { run: { font: "Arial", size: 24 } } // 12pt default
    },
    paragraphStyles: [
      {
        id: "nameStyle",
        name: "Name Style",
        basedOn: "Normal",
        run: { size: 28, bold: true, color: "000000", font: "Arial" },
        paragraph: { spacing: { before: 0, after: 120 }, alignment: AlignmentType.CENTER }
      },
      {
        id: "contactStyle", 
        name: "Contact Style",
        basedOn: "Normal",
        run: { size: 22, color: "000000", font: "Arial" },
        paragraph: { spacing: { before: 0, after: 240 }, alignment: AlignmentType.CENTER }
      },
      {
        id: "sectionHeader",
        name: "Section Header", 
        basedOn: "Normal",
        run: { size: 26, bold: true, color: "000000", font: "Arial" },
        paragraph: { spacing: { before: 240, after: 120 }, alignment: AlignmentType.LEFT }
      },
      {
        id: "companyHeader",
        name: "Company Header",
        basedOn: "Normal", 
        run: { size: 24, bold: true, color: "000000", font: "Arial" },
        paragraph: { spacing: { before: 120, after: 60 }, alignment: AlignmentType.LEFT }
      },
      {
        id: "roleTitle",
        name: "Role Title",
        basedOn: "Normal",
        run: { size: 24, bold: true, color: "000000", font: "Arial", italics: true },
        paragraph: { spacing: { before: 0, after: 60 }, alignment: AlignmentType.LEFT }
      },
      {
        id: "companyDesc",
        name: "Company Description", 
        basedOn: "Normal",
        run: { size: 22, color: "000000", font: "Arial", italics: true },
        paragraph: { spacing: { before: 0, after: 60 }, alignment: AlignmentType.LEFT }
      }
    ]
  },
  numbering: {
    config: [
      {
        reference: "bullet-list",
        levels: [
          {
            level: 0,
            format: LevelFormat.BULLET,
            text: "•",
            alignment: AlignmentType.LEFT,
            style: {
              paragraph: {
                indent: { left: 720, hanging: 360 }
              }
            }
          }
        ]
      }
    ]
  },
  sections: [{
    properties: {
      page: { margin: { top: 720, right: 720, bottom: 720, left: 720 } }
    },
    children: [
      // Header with name and contact
      new Paragraph({
        style: "nameStyle",
        children: [new TextRun("Abhi Shah")]
      }),
      
      new Paragraph({
        style: "contactStyle", 
        children: [new TextRun("uk.linkedin.com/in/abhinandanshah | abhinandan.shah@gmail.com | +971 501840687")]
      }),

      // EDUCATION Section
      new Paragraph({
        style: "sectionHeader",
        children: [new TextRun("EDUCATION")]
      }),

      new Paragraph({
        style: "companyHeader",
        children: [new TextRun("2017 - 2019 Bayes Business School, City, University of London")]
      }),
      
      new Paragraph({
        children: [new TextRun("Executive MBA (First Class with Merit), sponsored by Barclays Plc")]
      }),

      new Paragraph({
        spacing: { before: 120, after: 0 },
        children: [new TextRun("• Paper on \"Use of information business models in financial services industry\"")]
      }),

      new Paragraph({
        style: "companyHeader",
        children: [new TextRun("2001 - 2005 Pune University, India")]
      }),
      
      new Paragraph({
        children: [new TextRun("Bachelor of Computer Engineering (First Class with Distinction)")]
      }),

      // BUSINESS EXPERIENCE Section  
      new Paragraph({
        style: "sectionHeader",
        children: [new TextRun("BUSINESS EXPERIENCE")]
      }),

      // RAKBank
      new Paragraph({
        style: "companyHeader", 
        children: [new TextRun("2023 - Present RAKBank, Dubai, UAE")]
      }),

      new Paragraph({
        style: "companyDesc",
        children: [new TextRun("Leading UAE retail bank with focus on digital transformation")]
      }),

      new Paragraph({
        style: "roleTitle",
        children: [new TextRun("Head of Strategic Analytics & Data Science")]
      }),

      new Paragraph({
        numbering: { reference: "bullet-list", level: 0 },
        children: [new TextRun("Delivered AED 174 million in incremental revenue using AI models across customer lifecycle, upgrading 50% of leadership team")]
      }),

      new Paragraph({
        numbering: { reference: "bullet-list", level: 0 }, 
        children: [new TextRun("Launched industry-first generative search feature in digital banking app and 3 Gen AI applications in production within 3 months")]
      }),

      // Barclays UK - Voice & Chat
      new Paragraph({
        style: "companyHeader",
        children: [new TextRun("2023 Barclays UK, India")]
      }),

      new Paragraph({
        style: "companyDesc", 
        children: [new TextRun("Global investment bank and retail bank with £500bn+ in assets")]
      }),

      new Paragraph({
        style: "roleTitle",
        children: [new TextRun("Director, Head of Voice, Chat, AI and Customer Care Technology")]
      }),

      new Paragraph({
        numbering: { reference: "bullet-list", level: 0 },
        children: [new TextRun("Led 600-member technology function, reducing customer outages and complaints by 95% through AWS Connect platform stabilisation")]
      }),

      // Barclays - Risk & Data
      new Paragraph({
        style: "roleTitle",
        children: [new TextRun("Director, Head of Front Office Risk and Data Technology (2021-2023)")]
      }),

      new Paragraph({
        numbering: { reference: "bullet-list", level: 0 },
        children: [new TextRun("Managed 370+ investment banking risk technology team, recognised for 10% increase in speaking up and 13% increase in listening metrics")]
      }),

      new Paragraph({
        numbering: { reference: "bullet-list", level: 0 },
        children: [new TextRun("Co-chaired gender ERG covering 14,000 colleagues, launched 'Blossom' up-skilling platform for women's career development")]
      }),

      // Barclays - ML Director
      new Paragraph({
        style: "roleTitle", 
        children: [new TextRun("Director, Head of Machine Learning (2020-2021)")]
      }),

      new Paragraph({
        numbering: { reference: "bullet-list", level: 0 },
        children: [new TextRun("Scaled ML team from startup to 55 people, delivered rewards recommender with 1.7x conversion uplift across 13m customers")]
      }),

      new Paragraph({
        numbering: { reference: "bullet-list", level: 0 },
        children: [new TextRun("Created intelligent document system processing 24m documents with custom computer vision for KYC screening and automation")]
      }),

      // Barclays - VP Product Head
      new Paragraph({
        style: "roleTitle",
        children: [new TextRun("VP, Product Head, Machine Learning & Barclays Ventures (2017-2020)")]
      }),

      new Paragraph({
        numbering: { reference: "bullet-list", level: 0 },
        children: [new TextRun("Established machine learning team from scratch, built product-based ML solutions for customer complaints and NLP-based KYC screening")]
      }),

      // Vodafone
      new Paragraph({
        style: "companyHeader",
        children: [new TextRun("2016 - 2017 Vodafone Group Commercial, London")]
      }),

      new Paragraph({
        style: "companyDesc",
        children: [new TextRun("Global telecommunications company serving 300m+ customers across 21 markets")]
      }),

      new Paragraph({
        style: "roleTitle", 
        children: [new TextRun("Sr. Product & Commercial Manager")]
      }),

      new Paragraph({
        numbering: { reference: "bullet-list", level: 0 },
        children: [new TextRun("Grew My Vodafone App MAUs from 33m to 45m globally, increased revenue 15% through analytics-led targeting across 21 markets")]
      }),

      new Paragraph({
        numbering: { reference: "bullet-list", level: 0 },
        children: [new TextRun("Managed NetPerform speed-test app with 15m users, drove integration and personalised adoption strategies")]
      }),

      // Barclays - Product Head
      new Paragraph({
        style: "companyHeader",
        children: [new TextRun("2014 - 2016 Barclays Plc, UK")]
      }),

      new Paragraph({
        style: "roleTitle",
        children: [new TextRun("Product Head, Information Business")]
      }),

      new Paragraph({
        numbering: { reference: "bullet-list", level: 0 },
        children: [new TextRun("Led product management for industry-first big-data product 'SmartBusiness', mining 22bn data points for 1m UK businesses")]
      }),

      new Paragraph({
        numbering: { reference: "bullet-list", level: 0 },
        children: [new TextRun("Developed award-winning 'SmartPayment Insight' using machine learning to reduce payment acceptance failures for merchants")]
      }),

      // ADDITIONAL INFORMATION
      new Paragraph({
        style: "sectionHeader",
        children: [new TextRun("ADDITIONAL INFORMATION")]
      }),

      new Paragraph({
        numbering: { reference: "bullet-list", level: 0 },
        children: [new TextRun("AWS Certified Solution Architect Associate (2020), AWS Machine Learning Specialty (2022)")]
      }),

      new Paragraph({
        numbering: { reference: "bullet-list", level: 0 },
        children: [new TextRun("Google Certified Cloud Digital Leader (2022), Microsoft Certified Azure AI Engineer Associate (2022)")]
      }),

      new Paragraph({
        numbering: { reference: "bullet-list", level: 0 },
        children: [new TextRun("Advanced knowledge of Python, Java, JavaScript, AWS, Machine Learning, Data Architecture, Bayesian methods")]
      }),

      new Paragraph({
        numbering: { reference: "bullet-list", level: 0 },
        children: [new TextRun("Public speaking at IIM Ahmedabad, Scaler Academy; authored papers on Business Model Innovation and Quantum Computing")]
      }),

      new Paragraph({
        children: [new TextRun("Languages: English (native), Hindi (native)")]
      }),

      new Paragraph({
        children: [new TextRun("Nationality: Indian, UAE Resident")]
      })
    ]
  }]
});

// Save the document
Packer.toBuffer(doc).then((buffer) => {
  fs.writeFileSync(path.join(workspacePath, "Abhi_Shah_CV_LBS_Format.docx"), buffer);
  console.log("CV created successfully: Abhi_Shah_CV_LBS_Format.docx");
});