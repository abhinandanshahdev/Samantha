const fs = require('fs');
const { Document, Paragraph, TextRun, Packer, AlignmentType } = require('docx');

const doc = new Document({
    sections: [{
        properties: {},
        children: [
            // Header - Name
            new Paragraph({
                alignment: AlignmentType.LEFT,
                children: [
                    new TextRun({
                        text: "Abhinandan Shah",
                        bold: true,
                        size: 24
                    })
                ]
            }),
            
            // Contact Information
            new Paragraph({
                children: [
                    new TextRun({
                        text: "abhinandan.shah@gmail.com",
                        size: 22
                    })
                ]
            }),
            
            new Paragraph({
                children: [
                    new TextRun({
                        text: "www.linkedin.com/in/abhinandan-shah | www.abhinandanshah.com",
                        size: 22
                    })
                ]
            }),
            
            // Empty line
            new Paragraph({
                children: [new TextRun({ text: "" })]
            }),
            
            // EDUCATION Section
            new Paragraph({
                children: [
                    new TextRun({
                        text: "EDUCATION",
                        bold: true,
                        size: 22
                    })
                ]
            }),
            
            // Empty line
            new Paragraph({
                children: [new TextRun({ text: "" })]
            }),
            
            new Paragraph({
                children: [
                    new TextRun({
                        text: "2012 – 2014 Bayes Business School, London",
                        bold: true,
                        size: 22
                    })
                ]
            }),
            
            new Paragraph({
                children: [
                    new TextRun({
                        text: "Executive MBA, Strategy and Business Models",
                        size: 22
                    })
                ]
            }),
            
            // Empty line
            new Paragraph({
                children: [new TextRun({ text: "" })]
            }),
            
            new Paragraph({
                children: [
                    new TextRun({
                        text: "2001 – 2005 University of Pune, India",
                        bold: true,
                        size: 22
                    })
                ]
            }),
            
            new Paragraph({
                children: [
                    new TextRun({
                        text: "Bachelor of Engineering (B.E.), Computer Engineering",
                        size: 22
                    })
                ]
            }),
            
            // Empty line
            new Paragraph({
                children: [new TextRun({ text: "" })]
            }),
            
            // BUSINESS EXPERIENCE Section
            new Paragraph({
                children: [
                    new TextRun({
                        text: "BUSINESS EXPERIENCE",
                        bold: true,
                        size: 22
                    })
                ]
            }),
            
            // Empty line
            new Paragraph({
                children: [new TextRun({ text: "" })]
            }),
            
            // Current Role - DoF Abu Dhabi
            new Paragraph({
                children: [
                    new TextRun({
                        text: "2025 - Present Department of Finance, Abu Dhabi",
                        bold: true,
                        size: 22
                    })
                ]
            }),
            
            new Paragraph({
                children: [
                    new TextRun({
                        text: "Government department driving AI-native transformation in public finance",
                        size: 22
                    })
                ]
            }),
            
            new Paragraph({
                children: [
                    new TextRun({
                        text: "Head of Data & AI",
                        bold: true,
                        size: 22
                    })
                ]
            }),
            
            new Paragraph({
                children: [
                    new TextRun({
                        text: "• Formalised ambitious AI strategy for DoF with clear North Star, strategic action pillars and measurable outcomes aligned with Abu Dhabi digital strategy 2025-27",
                        size: 22
                    })
                ]
            }),
            
            new Paragraph({
                children: [
                    new TextRun({
                        text: "• Delivered unique multi-modal AI tool to execute AI strategy at scale, enabling multi-generational AI transformation under visionary leadership",
                        size: 22
                    })
                ]
            }),
            
            new Paragraph({
                children: [
                    new TextRun({
                        text: "• Implemented robust AI governance framework in line with UAE national AI strategy 2031, establishing data governance to enable AI-powered excellence",
                        size: 22
                    })
                ]
            }),
            
            // Empty line
            new Paragraph({
                children: [new TextRun({ text: "" })]
            }),
            
            // RAKBANK
            new Paragraph({
                children: [
                    new TextRun({
                        text: "2023 - 2025 RAKBANK, Dubai, UAE",
                        bold: true,
                        size: 22
                    })
                ]
            }),
            
            new Paragraph({
                children: [
                    new TextRun({
                        text: "Progressive UAE commercial bank with strong digital focus",
                        size: 22
                    })
                ]
            }),
            
            new Paragraph({
                children: [
                    new TextRun({
                        text: "Head of Strategic Analytics & AI Capabilities",
                        bold: true,
                        size: 22
                    })
                ]
            }),
            
            new Paragraph({
                children: [
                    new TextRun({
                        text: "• Scaled analytics workforce from 43 to 55 people including new offshore hub and spun up cross-functional CX AI Squad managing 50+ professionals",
                        size: 22
                    })
                ]
            }),
            
            new Paragraph({
                children: [
                    new TextRun({
                        text: "• Delivered industrial-grade MLOps, rationalising model estate from 45 to 30 while automating 100% of ML lifecycle through DataRobot pipelines",
                        size: 22
                    })
                ]
            }),
            
            new Paragraph({
                children: [
                    new TextRun({
                        text: "• Generated hundreds of millions AED incremental revenue through 30 production models, achieving +6% active customer base, -15% churn, +11% FX income",
                        size: 22
                    })
                ]
            }),
            
            new Paragraph({
                children: [
                    new TextRun({
                        text: "• Launched UAE's first GenAI banking feature: in-app generative search & knowledge bot scaling toward 500k users, making 120+ services conversational",
                        size: 22
                    })
                ]
            }),
            
            new Paragraph({
                children: [
                    new TextRun({
                        text: "• Boosted BTL campaigns from 130 to 180 (+30%) in 2024, improving conversion +2pp and adding AED 170m value with no extra customer contact load",
                        size: 22
                    })
                ]
            }),
            
            // Empty line
            new Paragraph({
                children: [new TextRun({ text: "" })]
            }),
            
            // Barclays consolidated
            new Paragraph({
                children: [
                    new TextRun({
                        text: "2008 - 2023 Barclays, UK & India",
                        bold: true,
                        size: 22
                    })
                ]
            }),
            
            new Paragraph({
                children: [
                    new TextRun({
                        text: "Global investment bank and retail banking group",
                        size: 22
                    })
                ]
            }),
            
            new Paragraph({
                children: [
                    new TextRun({
                        text: "Director, Head of Machine Learning & Technology (2020-2023)",
                        bold: true,
                        size: 22
                    })
                ]
            }),
            
            new Paragraph({
                children: [
                    new TextRun({
                        text: "• Led 370+ investment banking risk technology and data function including enterprise risk engines, petabyte-scale data products and trader-facing analytics",
                        size: 22
                    })
                ]
            }),
            
            new Paragraph({
                children: [
                    new TextRun({
                        text: "• Built from scratch multi-disciplinary AI team delivering scalable enterprise solutions including rewards recommender with 1.7x conversion uplift",
                        size: 22
                    })
                ]
            }),
            
            new Paragraph({
                children: [
                    new TextRun({
                        text: "• Implemented intelligent document management system with custom OCR/NLP handling 24m documents and NLU system processing 10m calls quarterly",
                        size: 22
                    })
                ]
            }),
            
            new Paragraph({
                children: [
                    new TextRun({
                        text: "• Recognised by BX Technology leadership for building strong teams, achieving 10% increase in engagement and 13% increase in inclusion metrics",
                        size: 22
                    })
                ]
            }),
            
            // Empty line
            new Paragraph({
                children: [new TextRun({ text: "" })]
            }),
            
            // ADDITIONAL INFORMATION
            new Paragraph({
                children: [
                    new TextRun({
                        text: "ADDITIONAL INFORMATION",
                        bold: true,
                        size: 22
                    })
                ]
            }),
            
            // Empty line
            new Paragraph({
                children: [new TextRun({ text: "" })]
            }),
            
            new Paragraph({
                children: [
                    new TextRun({
                        text: "• AWS Certified for Architecture and Machine Learning Specialty, Azure Certified for AI Engineering, Google Certified for Digital Cloud",
                        size: 22
                    })
                ]
            }),
            
            new Paragraph({
                children: [
                    new TextRun({
                        text: "• Published thought leadership on mindfulnessindex.substack.com covering AI, technology and business strategy insights",
                        size: 22
                    })
                ]
            }),
            
            new Paragraph({
                children: [
                    new TextRun({
                        text: "• Co-chair for gender employee resource group (ERG) in Pune, leading 'Blossom' upskilling platform for 14k+ colleagues",
                        size: 22
                    })
                ]
            }),
            
            new Paragraph({
                children: [
                    new TextRun({
                        text: "• Advanced knowledge of DataRobot, Hadoop, React.js, cloud platforms (AWS, Azure, Google Cloud) and enterprise data management systems",
                        size: 22
                    })
                ]
            }),
            
            // Empty line
            new Paragraph({
                children: [new TextRun({ text: "" })]
            }),
            
            new Paragraph({
                children: [
                    new TextRun({
                        text: "Languages: English (Full Professional), Hindi (Full Professional), Marathi (Native)",
                        bold: true,
                        size: 22
                    })
                ]
            }),
            
            // Empty line
            new Paragraph({
                children: [new TextRun({ text: "" })]
            }),
            
            new Paragraph({
                children: [
                    new TextRun({
                        text: "Nationality: Indian",
                        bold: true,
                        size: 22
                    })
                ]
            })
        ]
    }]
});

Packer.toBuffer(doc).then((buffer) => {
    fs.writeFileSync("Abhinandan_Shah_CV.docx", buffer);
    console.log("CV created successfully!");
});