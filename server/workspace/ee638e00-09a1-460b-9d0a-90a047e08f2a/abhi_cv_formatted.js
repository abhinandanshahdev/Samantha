const fs = require('fs');
const { Document, Packer, Paragraph, TextRun, HeadingLevel } = require('docx');

const doc = new Document({
  sections: [{
    properties: {},
    children: [
      // Header - Name in bold
      new Paragraph({
        children: [
          new TextRun({
            text: "Abhi Shah, MBA",
            bold: true,
            size: 24
          })
        ],
        spacing: { after: 200 }
      }),

      // Contact info
      new Paragraph({
        children: [
          new TextRun({
            text: "abhinandan.shah@gmail.com"
          })
        ],
        spacing: { after: 100 }
      }),

      new Paragraph({
        children: [
          new TextRun({
            text: "+ 971 501840687"
          })
        ],
        spacing: { after: 400 }
      }),

      // EDUCATION Section
      new Paragraph({
        children: [
          new TextRun({
            text: "EDUCATION",
            bold: true,
            size: 22
          })
        ],
        spacing: { after: 200 }
      }),

      new Paragraph({
        children: [
          new TextRun({
            text: "2017 – 2019 Bayes Business School, City, University of London",
            bold: true
          })
        ],
        spacing: { after: 100 }
      }),

      new Paragraph({
        children: [
          new TextRun({
            text: "Executive MBA (First Class with Merit)"
          })
        ],
        spacing: { after: 200 }
      }),

      new Paragraph({
        children: [
          new TextRun({
            text: "2001 – 2005 Pune University, India",
            bold: true
          })
        ],
        spacing: { after: 100 }
      }),

      new Paragraph({
        children: [
          new TextRun({
            text: "Bachelor of Computer Engineering (First Class with Distinction)"
          })
        ],
        spacing: { after: 400 }
      }),

      // BUSINESS EXPERIENCE Section
      new Paragraph({
        children: [
          new TextRun({
            text: "BUSINESS EXPERIENCE",
            bold: true,
            size: 22
          })
        ],
        spacing: { after: 200 }
      }),

      // RAKBANK
      new Paragraph({
        children: [
          new TextRun({
            text: "2023 - Present RAKBANK, Dubai, UAE",
            bold: true
          })
        ],
        spacing: { after: 100 }
      }),

      new Paragraph({
        children: [
          new TextRun({
            text: "Leading retail bank in UAE with AED 58bn assets",
            bold: true
          })
        ],
        spacing: { after: 100 }
      }),

      new Paragraph({
        children: [
          new TextRun({
            text: "Head of Strategic Analytics & Data Science",
            bold: true
          })
        ],
        spacing: { after: 100 }
      }),

      new Paragraph({
        children: [
          new TextRun({
            text: "- Delivered AED 174 million in incremental revenue using AI models across customer lifecycle, transforming bank's data-driven decision making capabilities"
          })
        ],
        spacing: { after: 100 }
      }),

      new Paragraph({
        children: [
          new TextRun({
            text: "- Launched industry-first generative search feature in digital banking app and scaled 3 Gen AI applications to production serving 600k+ customers"
          })
        ],
        spacing: { after: 100 }
      }),

      new Paragraph({
        children: [
          new TextRun({
            text: "- Upgraded 50% of leadership team and 20% of workforce, building state-of-the-art analytics capability from global talent pool"
          })
        ],
        spacing: { after: 200 }
      }),

      // Barclays 2023
      new Paragraph({
        children: [
          new TextRun({
            text: "2023 Barclays UK, India",
            bold: true
          })
        ],
        spacing: { after: 100 }
      }),

      new Paragraph({
        children: [
          new TextRun({
            text: "Top 5 global investment bank",
            bold: true
          })
        ],
        spacing: { after: 100 }
      }),

      new Paragraph({
        children: [
          new TextRun({
            text: "Director, Head of Voice, Chat, AI and Customer Care Technology",
            bold: true
          })
        ],
        spacing: { after: 100 }
      }),

      new Paragraph({
        children: [
          new TextRun({
            text: "- Led 600-member customer care technology function, stabilising AWS Connect platform and reducing customer outages by 95%"
          })
        ],
        spacing: { after: 100 }
      }),

      new Paragraph({
        children: [
          new TextRun({
            text: "- Pioneered early experiments in generative AI for contact center processes as development partner with Amazon Web Services Bedrock platform"
          })
        ],
        spacing: { after: 200 }
      }),

      // Barclays 2021-2023
      new Paragraph({
        children: [
          new TextRun({
            text: "2021 - 2023 Barclays, India",
            bold: true
          })
        ],
        spacing: { after: 100 }
      }),

      new Paragraph({
        children: [
          new TextRun({
            text: "Director, Head of Front Office Risk and Data Technology",
            bold: true
          })
        ],
        spacing: { after: 100 }
      }),

      new Paragraph({
        children: [
          new TextRun({
            text: "- Managed 370+ Investment banking risk technology team, delivering enterprise risk engines and petabyte-scale data products for trading operations"
          })
        ],
        spacing: { after: 100 }
      }),

      new Paragraph({
        children: [
          new TextRun({
            text: "- Recognised by CXO leadership for 10% YoY increase in team engagement, inclusion metrics and fostering high-performance culture"
          })
        ],
        spacing: { after: 200 }
      }),

      // Barclays 2020-2021
      new Paragraph({
        children: [
          new TextRun({
            text: "2020 - 2021 Barclays UK Technology, India",
            bold: true
          })
        ],
        spacing: { after: 100 }
      }),

      new Paragraph({
        children: [
          new TextRun({
            text: "Director, Head of Machine Learning",
            bold: true
          })
        ],
        spacing: { after: 100 }
      }),

      new Paragraph({
        children: [
          new TextRun({
            text: "- Scaled ML team from scratch to 55 people, delivering rewards recommender with 1.7x conversion uplift across 13m customers"
          })
        ],
        spacing: { after: 100 }
      }),

      new Paragraph({
        children: [
          new TextRun({
            text: "- Implemented intelligent document system processing 24m documents with custom computer vision for KYC and fraud detection"
          })
        ],
        spacing: { after: 200 }
      }),

      // Barclays/Ventures 2017-2020
      new Paragraph({
        children: [
          new TextRun({
            text: "2017 - 2020 Barclays Ventures, India",
            bold: true
          })
        ],
        spacing: { after: 100 }
      }),

      new Paragraph({
        children: [
          new TextRun({
            text: "VP, Product Head Machine Learning",
            bold: true
          })
        ],
        spacing: { after: 100 }
      }),

      new Paragraph({
        children: [
          new TextRun({
            text: "- Established ML center of excellence from ground up, delivering customer complaint classification and NLP solutions across retail banking"
          })
        ],
        spacing: { after: 100 }
      }),

      new Paragraph({
        children: [
          new TextRun({
            text: "- Led data science initiatives applying advanced analytics to build new revenue-generating products and platform capabilities"
          })
        ],
        spacing: { after: 200 }
      }),

      // Vodafone
      new Paragraph({
        children: [
          new TextRun({
            text: "2016 - 2017 Vodafone Group Commercial, London",
            bold: true
          })
        ],
        spacing: { after: 100 }
      }),

      new Paragraph({
        children: [
          new TextRun({
            text: "Global telecommunications leader",
            bold: true
          })
        ],
        spacing: { after: 100 }
      }),

      new Paragraph({
        children: [
          new TextRun({
            text: "Senior Product & Commercial Manager",
            bold: true
          })
        ],
        spacing: { after: 100 }
      }),

      new Paragraph({
        children: [
          new TextRun({
            text: "- Grew My Vodafone app global MAUs from 33m to 45m users across 21 markets, driving 15% revenue growth through analytics-led targeting"
          })
        ],
        spacing: { after: 100 }
      }),

      new Paragraph({
        children: [
          new TextRun({
            text: "- Launched NetPerform speed-test app serving 15m users, integrating acquisition into core servicing platform"
          })
        ],
        spacing: { after: 200 }
      }),

      // Early Barclays
      new Paragraph({
        children: [
          new TextRun({
            text: "2014 - 2016 Barclays Plc, London",
            bold: true
          })
        ],
        spacing: { after: 100 }
      }),

      new Paragraph({
        children: [
          new TextRun({
            text: "Product Head, Information Business",
            bold: true
          })
        ],
        spacing: { after: 100 }
      }),

      new Paragraph({
        children: [
          new TextRun({
            text: "- Led go-to-market for industry-first SmartBusiness big data product, mining 22bn data points to serve 1m UK businesses"
          })
        ],
        spacing: { after: 100 }
      }),

      new Paragraph({
        children: [
          new TextRun({
            text: "- Developed award-winning SmartPayment insight product using machine learning to reduce merchant payment failures"
          })
        ],
        spacing: { after: 400 }
      }),

      // ADDITIONAL INFORMATION Section
      new Paragraph({
        children: [
          new TextRun({
            text: "ADDITIONAL INFORMATION",
            bold: true,
            size: 22
          })
        ],
        spacing: { after: 200 }
      }),

      new Paragraph({
        children: [
          new TextRun({
            text: "- AWS Certified Solution Architect Associate (2020), AWS Certified Machine Learning Specialty (2022)"
          })
        ],
        spacing: { after: 100 }
      }),

      new Paragraph({
        children: [
          new TextRun({
            text: "- Google Certified Cloud Digital Leader (2022), Microsoft Certified Azure AI Engineer Associate (2022)"
          })
        ],
        spacing: { after: 100 }
      }),

      new Paragraph({
        children: [
          new TextRun({
            text: "- Authored papers on Business Model Innovation and Quantum Computing; speaker at IIM Ahmedabad, Scaler Academy"
          })
        ],
        spacing: { after: 100 }
      }),

      new Paragraph({
        children: [
          new TextRun({
            text: "- Co-chair for gender employee resource group covering 14,000 colleagues, leading women's upskilling platform"
          })
        ],
        spacing: { after: 100 }
      }),

      new Paragraph({
        children: [
          new TextRun({
            text: "- Advanced knowledge of Python, Java, JavaScript, Bayesian methods, causal inference, data architecture"
          })
        ],
        spacing: { after: 100 }
      }),

      new Paragraph({
        children: [
          new TextRun({
            text: "- Led cross-functional teams across 21 global markets, managing P&Ls worth millions of GBP and AED"
          })
        ],
        spacing: { after: 200 }
      }),

      new Paragraph({
        children: [
          new TextRun({
            text: "Languages: English (native), Hindi (native), Gujarati (native)",
            bold: true
          })
        ],
        spacing: { after: 100 }
      }),

      new Paragraph({
        children: [
          new TextRun({
            text: "Nationality: British/Indian",
            bold: true
          })
        ]
      })
    ]
  }]
});

// Generate and save the document
Packer.toBuffer(doc).then((buffer) => {
  fs.writeFileSync(`${process.env.WORKSPACE_PATH || '.'}/Abhi_Shah_CV_LBS_Format.docx`, buffer);
  console.log('Document created successfully!');
});