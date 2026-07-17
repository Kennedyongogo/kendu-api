const PDFDocument = require("pdfkit");
const { Document, Paragraph, TextRun, Table, TableRow, TableCell, AlignmentType, WidthType, HeadingLevel, ImageRun, ExternalHyperlink, Media } = require("docx");
const { Packer } = require("docx");
const path = require("path");
const fs = require("fs");

/**
 * Generate PDF Report
 */
const generatePDFReport = async (reportData) => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ 
        margin: 40, 
        size: "A4",
        layout: "portrait",
        info: {
          Title: "Foundation Activity Report",
          Author: "Foundation Management System",
          Subject: "Activity Report",
          Keywords: "report, foundation, activities, projects",
          CreationDate: new Date(),
        }
      });
      const chunks = [];

      // Collect PDF chunks
      doc.on("data", (chunk) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      // Helper function to format date
      const formatDate = (date) => {
        return new Date(date).toLocaleDateString("en-US", {
          year: "numeric",
          month: "long",
          day: "numeric",
        });
      };

      // Helper function to add page break if needed
      const checkPageBreak = (requiredSpace = 100) => {
        if (doc.y + requiredSpace > doc.page.height - doc.page.margins.bottom) {
          doc.addPage();
          return true;
        }
        return false;
      };

      // Helper function to add section header
      const addSectionHeader = (title, color = "#2c3e50") => {
        checkPageBreak(60);
        doc.moveDown(1);
        doc
          .fontSize(16)
          .fillColor(color)
          .text(title, { underline: true });
      doc.moveDown(0.5);
      };

      // Helper function to add subsection
      const addSubsection = (title, color = "#34495e") => {
        checkPageBreak(40);
      doc
        .fontSize(12)
          .fillColor(color)
          .text(title, { indent: 20 });
        doc.moveDown(0.3);
      };

      // Helper function to add content with proper spacing
      const addContent = (text, options = {}) => {
        const defaultOptions = {
          indent: 30,
          fontSize: 10,
          color: "#2c3e50",
          lineGap: 2,
        };
        const finalOptions = { ...defaultOptions, ...options };
        
        doc
          .fontSize(finalOptions.fontSize)
          .fillColor(finalOptions.color)
          .text(text, { 
            indent: finalOptions.indent,
            lineGap: finalOptions.lineGap,
            width: doc.page.width - doc.page.margins.left - doc.page.margins.right - finalOptions.indent
          });
        doc.moveDown(0.2);
      };

      // Foundation Header with Logo (Centered Layout)
      const logoPath = path.join(__dirname, '../../public/logos/foundation-logo.png');
      const logoSize = 80;
      const logoY = doc.y;
      
      // Calculate center position for the logo/header group
      const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
      const logoX = doc.page.margins.left + (pageWidth - logoSize - 200) / 2; // 200 is approximate text width
      
      if (fs.existsSync(logoPath)) {
        // Place logo centered
        doc.image(logoPath, {
          fit: [logoSize, logoSize],
          x: logoX,
          y: logoY
        });
      }

      // Foundation Header (next to logo, centered)
      const headerX = logoX + logoSize + 20;
      const headerY = logoY + 10;
      
      doc
        .fontSize(28)
        .fillColor("#2c3e50")
        .text("Mwalimu Hope Foundation", headerX, headerY);

      // Tagline (below header, centered)
      doc
        .fontSize(16)
        .fillColor("#7f8c8d")
        .text("Empowering Minds, Restoring Hope", headerX, headerY + 35);

      // Move cursor below the logo/header section
      doc.y = logoY + logoSize + 20;

      doc.moveDown(1);

      // Report Title
      doc
        .fontSize(28)
        .fillColor("#2c3e50")
        .text("ACTIVITY REPORT", { align: "center" });

      doc.moveDown(2);

      // Report Period - Use display dates (original user selection)
      const displayStart = reportData.displayDateRange ? reportData.displayDateRange.start : reportData.dateRange.start;
      const displayEnd = reportData.displayDateRange ? reportData.displayDateRange.end : reportData.dateRange.end;
      
      doc
        .fontSize(14)
        .fillColor("#34495e")
        .text(`Report Period: ${formatDate(displayStart)} - ${formatDate(displayEnd)}`, { align: "center" });

      doc
        .fontSize(12)
        .fillColor("#95a5a6")
        .text(`Generated on: ${formatDate(new Date())}`, { align: "center" });

      doc.moveDown(3);

      // Executive Summary Section
      addSectionHeader("EXECUTIVE SUMMARY", "#2c3e50");

      // Summary statistics in a table format
      const summaryData = [
        { label: "Total Projects", value: reportData.summary.projects?.total || 0 },
        { label: "Total Inquiries", value: reportData.summary.inquiries?.total || 0 },
        { label: "Total Documents", value: reportData.summary.documents?.total || 0 },
        { label: "Total Activities", value: reportData.summary.activities?.total || 0 },
      ];

      // Create summary table
      const tableTop = doc.y;
      const colWidth = (doc.page.width - doc.page.margins.left - doc.page.margins.right) / 2;
      const rowHeight = 25;

      summaryData.forEach((item, index) => {
        const x = doc.page.margins.left + (index % 2) * colWidth;
        const y = tableTop + Math.floor(index / 2) * rowHeight;

        // Background
        doc
          .rect(x, y, colWidth - 10, rowHeight - 5)
          .fill("#f8f9fa");

        // Border
        doc
          .rect(x, y, colWidth - 10, rowHeight - 5)
          .stroke("#dee2e6");

        // Label
        doc
          .fontSize(10)
          .fillColor("#2c3e50")
          .text(item.label, x + 10, y + 5);

        // Value
        doc
          .fontSize(16)
          .fillColor("#667eea")
          .text(item.value.toString(), x + 10, y + 15);
      });

      doc.y = tableTop + (Math.ceil(summaryData.length / 2) * rowHeight) + 20;

      // Projects Section
      if (reportData.projects && reportData.projects.length > 0) {
        addSectionHeader("PROJECTS OVERVIEW", "#27ae60");
        
        // Projects by status breakdown
        if (reportData.summary.projects?.byStatus) {
          addSubsection("Status Distribution", "#34495e");

          reportData.summary.projects.byStatus.forEach((stat) => {
            addContent(`• ${stat.status.charAt(0).toUpperCase() + stat.status.slice(1)}: ${stat.count} projects`, {
              indent: 50,
              fontSize: 11,
              color: "#2c3e50"
            });
          });
          doc.moveDown(0.5);
        }

        // Project details
        addSubsection("Project Details", "#34495e");

        reportData.projects.slice(0, 15).forEach((project, index) => {
          checkPageBreak(60);
          
          // Project header with background
          doc
            .rect(doc.page.margins.left, doc.y, doc.page.width - doc.page.margins.left - doc.page.margins.right, 25)
            .fill("#e8f5e8");
          
          doc
            .fontSize(12)
            .fillColor("#27ae60")
            .text(`${index + 1}. ${project.name}`, doc.page.margins.left + 10, doc.y + 5);
          
          doc.y += 30;

          // Project details in organized format
          addContent(`Status: ${project.status.charAt(0).toUpperCase() + project.status.slice(1)}`, {
            indent: 50,
            fontSize: 10,
            color: "#2c3e50"
          });
          
          addContent(`Category: ${project.category.charAt(0).toUpperCase() + project.category.slice(1)}`, {
            indent: 50,
            fontSize: 10,
            color: "#2c3e50"
          });
          
          addContent(`Location: ${project.county}${project.subcounty ? `, ${project.subcounty}` : ''}`, {
            indent: 50,
            fontSize: 10,
            color: "#2c3e50"
          });
          
          if (project.creator) {
            addContent(`Created by: ${project.creator.full_name}`, {
              indent: 50,
              fontSize: 10,
              color: "#2c3e50"
            });
          }
          
          if (project.description) {
            addContent(`Description: ${project.description.substring(0, 100)}${project.description.length > 100 ? '...' : ''}`, {
              indent: 50,
              fontSize: 10,
              color: "#7f8c8d"
            });
          }
          
          doc.moveDown(0.3);
        });

        if (reportData.projects.length > 15) {
          addContent(`... and ${reportData.projects.length - 15} more projects`, {
            indent: 50,
            fontSize: 9,
            color: "#95a5a6"
          });
        }

        doc.moveDown(1);
      }

      // Inquiries Section
      if (reportData.inquiries && reportData.inquiries.length > 0) {
        addSectionHeader("INQUIRIES OVERVIEW", "#f39c12");
        
        // Inquiries by status breakdown
        if (reportData.summary.inquiries?.byStatus) {
          addSubsection("Status Distribution", "#34495e");

          reportData.summary.inquiries.byStatus.forEach((stat) => {
            addContent(`• ${stat.status.charAt(0).toUpperCase() + stat.status.slice(1)}: ${stat.count} inquiries`, {
              indent: 50,
              fontSize: 11,
              color: "#2c3e50"
            });
          });
          doc.moveDown(0.5);
        }

        // Inquiry details
        addSubsection("Recent Inquiries", "#34495e");

        reportData.inquiries.slice(0, 15).forEach((inquiry, index) => {
          checkPageBreak(50);
          
          // Inquiry header with background
          doc
            .rect(doc.page.margins.left, doc.y, doc.page.width - doc.page.margins.left - doc.page.margins.right, 20)
            .fill("#fff8e1");
          
          doc
            .fontSize(12)
            .fillColor("#f39c12")
            .text(`${index + 1}. ${inquiry.full_name}`, doc.page.margins.left + 10, doc.y + 3);
          
          doc.y += 25;

          // Inquiry details
          addContent(`Email: ${inquiry.email}`, {
            indent: 50,
            fontSize: 10,
            color: "#2c3e50"
          });
          
          addContent(`Category: ${inquiry.category.charAt(0).toUpperCase() + inquiry.category.slice(1)}`, {
            indent: 50,
            fontSize: 10,
            color: "#2c3e50"
          });
          
          addContent(`Status: ${inquiry.status.charAt(0).toUpperCase() + inquiry.status.slice(1)}`, {
            indent: 50,
            fontSize: 10,
            color: "#2c3e50"
          });
          
          if (inquiry.message) {
            addContent(`Message: ${inquiry.message.substring(0, 80)}${inquiry.message.length > 80 ? '...' : ''}`, {
              indent: 50,
              fontSize: 10,
              color: "#7f8c8d"
            });
          }
          
          doc.moveDown(0.3);
        });

        if (reportData.inquiries.length > 15) {
          addContent(`... and ${reportData.inquiries.length - 15} more inquiries`, {
            indent: 50,
            fontSize: 9,
            color: "#95a5a6"
          });
        }

        doc.moveDown(1);
      }

      // Documents Section
      if (reportData.documents && reportData.documents.length > 0) {
        addSectionHeader("DOCUMENTS OVERVIEW", "#9b59b6");

        addSubsection("Document Statistics", "#34495e");
        
        addContent(`Total Documents Uploaded: ${reportData.documents.length}`, {
          indent: 50,
          fontSize: 11,
          color: "#2c3e50"
        });

        // Document type breakdown if available
        if (reportData.summary.documents?.byType) {
          addContent("Document Types:", {
            indent: 50,
            fontSize: 10,
            color: "#34495e"
          });
          
          reportData.summary.documents.byType.forEach((type) => {
            addContent(`• ${type.type || 'Unknown'}: ${type.count} documents`, {
              indent: 70,
              fontSize: 10,
              color: "#2c3e50"
            });
          });
        }

        doc.moveDown(1);
      }

      // Activities Section
      if (reportData.activities && reportData.activities.length > 0) {
        addSectionHeader("ACTIVITY LOG", "#e74c3c");

        addSubsection("Recent Activities", "#34495e");

        reportData.activities.slice(0, 20).forEach((activity, index) => {
          checkPageBreak(40);
          
          // Activity header with background
          doc
            .rect(doc.page.margins.left, doc.y, doc.page.width - doc.page.margins.left - doc.page.margins.right, 18)
            .fill("#fdf2f2");
          
          doc
            .fontSize(10)
            .fillColor("#e74c3c")
            .text(`${formatDate(activity.createdAt)}`, doc.page.margins.left + 10, doc.y + 2);
          
          doc.y += 20;

          // Activity details
          addContent(`Action: ${activity.action}`, {
            indent: 50,
            fontSize: 10,
            color: "#2c3e50"
          });
          
          addContent(`Description: ${activity.description}`, {
            indent: 50,
            fontSize: 10,
            color: "#7f8c8d"
          });
          
          if (activity.user && activity.user.full_name) {
            addContent(`User: ${activity.user.full_name}`, {
              indent: 50,
              fontSize: 9,
              color: "#95a5a6"
            });
          }
          
          doc.moveDown(0.2);
        });

        if (reportData.activities.length > 20) {
          addContent(`... and ${reportData.activities.length - 20} more activities`, {
            indent: 50,
            fontSize: 9,
            color: "#95a5a6"
          });
        }

        doc.moveDown(1);
      }

      // Footer
      addSectionHeader("REPORT SUMMARY", "#2c3e50");
      
      addContent("This report provides a comprehensive overview of foundation activities for the specified period.", {
        indent: 30,
        fontSize: 11,
        color: "#2c3e50"
      });
      
      addContent("For more detailed information or questions about this report, please contact the foundation administration.", {
        indent: 30,
        fontSize: 10,
        color: "#7f8c8d"
      });

      doc.moveDown(2);
      
      // Footer with page info
      doc
        .fontSize(8)
        .fillColor("#95a5a6")
        .text("Foundation Activity Report - Generated by Foundation Management System", { align: "center" });
      
      doc
        .fontSize(8)
        .fillColor("#95a5a6")
        .text(`Page ${doc.page.number}`, { align: "right" });

      // Finalize PDF
      doc.end();
    } catch (error) {
      reject(error);
    }
  });
};


/**
 * Generate Word Report
 */
const generateWordReport = async (reportData) => {
  try {
    const formatDate = (date) => {
      return new Date(date).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    };

    const children = [];

    // Foundation Header with Logo (Horizontal Layout)
    const logoPath = path.join(__dirname, '../../public/logos/foundation-logo.png');
    
    if (fs.existsSync(logoPath)) {
      try {
        const imageBuffer = fs.readFileSync(logoPath);
        
        // Create a table to hold logo and text side by side (centered, no borders)
        const headerTable = new Table({
          rows: [
            new TableRow({
              children: [
                // Logo cell
                new TableCell({
                  children: [
                    new Paragraph({
                      children: [
                        new ImageRun({
                          data: imageBuffer,
                          transformation: {
                            width: 80,
                            height: 80,
                          },
                        }),
                      ],
                      alignment: AlignmentType.CENTER,
                    }),
                  ],
                  width: { size: 20, type: WidthType.PERCENTAGE },
                  margins: { top: 0, bottom: 0, left: 0, right: 0 },
                }),
                // Text cell
                new TableCell({
                  children: [
                    new Paragraph({
                      children: [
                        new TextRun({
                          text: "Mwalimu Hope Foundation",
                          bold: true,
                          size: 28,
                          color: "2c3e50",
                        }),
                      ],
                      alignment: AlignmentType.LEFT,
                    }),
                    new Paragraph({
                      children: [
                        new TextRun({
                          text: "Empowering Minds, Restoring Hope",
                          italic: true,
                          size: 16,
                          color: "7f8c8d",
                        }),
                      ],
                      alignment: AlignmentType.LEFT,
                    }),
                  ],
                  width: { size: 80, type: WidthType.PERCENTAGE },
                  margins: { top: 0, bottom: 0, left: 0, right: 0 },
                }),
              ],
            }),
          ],
          width: { size: 100, type: WidthType.PERCENTAGE },
          alignment: AlignmentType.CENTER,
        });
        
        children.push(headerTable);
        children.push(
          new Paragraph({
            text: "",
            spacing: { after: 200 },
          })
        );
      } catch (error) {
        console.error('Error adding logo to Word document:', error);
        // Fallback to text-only layout
        children.push(
          new Paragraph({
            children: [
              new TextRun({
                text: "Mwalimu Hope Foundation",
                bold: true,
                size: 32,
                color: "2c3e50",
              }),
            ],
            alignment: AlignmentType.CENTER,
            spacing: { after: 100 },
          })
        );
        children.push(
          new Paragraph({
            children: [
              new TextRun({
                text: "Empowering Minds, Restoring Hope",
                italic: true,
                size: 20,
                color: "7f8c8d",
              }),
            ],
            alignment: AlignmentType.CENTER,
            spacing: { after: 200 },
          })
        );
      }
    } else {
      // Fallback: Add text-based logo representation
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: "🏛️ Mwalimu Hope Foundation",
              bold: true,
              size: 32,
              color: "2c3e50",
            }),
          ],
          alignment: AlignmentType.CENTER,
          spacing: { after: 100 },
        })
      );
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: "Empowering Minds, Restoring Hope",
              italic: true,
              size: 20,
              color: "7f8c8d",
            }),
          ],
          alignment: AlignmentType.CENTER,
          spacing: { after: 200 },
        })
      );
    }

    // Report Title
    children.push(
      new Paragraph({
        text: "Activity Report",
        heading: HeadingLevel.HEADING_1,
        alignment: AlignmentType.CENTER,
        spacing: { after: 200 },
      })
    );

    // Date Range - Use display dates (original user selection)
    const displayStart = reportData.displayDateRange ? reportData.displayDateRange.start : reportData.dateRange.start;
    const displayEnd = reportData.displayDateRange ? reportData.displayDateRange.end : reportData.dateRange.end;
    
    
    children.push(
      new Paragraph({
        text: `Report Period: ${formatDate(displayStart)} - ${formatDate(displayEnd)}`,
        alignment: AlignmentType.CENTER,
        spacing: { after: 100 },
      })
    );

    children.push(
      new Paragraph({
        text: `Generated on: ${formatDate(new Date())}`,
        alignment: AlignmentType.CENTER,
        spacing: { after: 400 },
      })
    );

    // Executive Summary
    children.push(
      new Paragraph({
        text: "Executive Summary",
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 200, after: 200 },
      })
    );

    // Summary table
    const summaryTable = new Table({
      rows: [
        new TableRow({
          children: [
            new TableCell({ children: [new Paragraph("Metric")] }),
            new TableCell({ children: [new Paragraph("Count")] }),
          ],
        }),
        new TableRow({
          children: [
            new TableCell({ children: [new Paragraph("Projects")] }),
            new TableCell({
              children: [
                new Paragraph((reportData.summary.projects?.total || 0).toString()),
              ],
            }),
          ],
        }),
        new TableRow({
          children: [
            new TableCell({ children: [new Paragraph("Inquiries")] }),
            new TableCell({
              children: [
                new Paragraph((reportData.summary.inquiries?.total || 0).toString()),
              ],
            }),
          ],
        }),
        new TableRow({
          children: [
            new TableCell({ children: [new Paragraph("Documents")] }),
            new TableCell({
              children: [
                new Paragraph((reportData.summary.documents?.total || 0).toString()),
              ],
            }),
          ],
        }),
        new TableRow({
          children: [
            new TableCell({ children: [new Paragraph("Activities")] }),
            new TableCell({
              children: [
                new Paragraph((reportData.summary.activities?.total || 0).toString()),
              ],
            }),
          ],
        }),
      ],
      width: { size: 100, type: WidthType.PERCENTAGE },
    });

    children.push(summaryTable);
    children.push(new Paragraph({ text: "", spacing: { after: 400 } }));

    // Projects Section
    if (reportData.projects && reportData.projects.length > 0) {
      children.push(
        new Paragraph({
          text: "Projects",
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 200, after: 200 },
        })
      );

      reportData.projects.slice(0, 20).forEach((project, index) => {
        children.push(
          new Paragraph({
            children: [
              new TextRun({ text: `${index + 1}. ${project.name}`, bold: true }),
            ],
            spacing: { after: 100 },
          })
        );

        children.push(
          new Paragraph({
            text: `   Status: ${project.status} | Category: ${project.category}`,
            spacing: { after: 50 },
          })
        );

        children.push(
          new Paragraph({
            text: `   County: ${project.county}`,
            spacing: { after: 50 },
          })
        );

        if (project.creator) {
          children.push(
            new Paragraph({
              text: `   Created by: ${project.creator.full_name}`,
              spacing: { after: 200 },
            })
          );
        }
      });
    }

    // Inquiries Section
    if (reportData.inquiries && reportData.inquiries.length > 0) {
      children.push(
        new Paragraph({
          text: "Inquiries",
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 200, after: 200 },
        })
      );

      reportData.inquiries.slice(0, 20).forEach((inquiry, index) => {
        children.push(
          new Paragraph({
            children: [
              new TextRun({ text: `${index + 1}. ${inquiry.full_name}`, bold: true }),
            ],
            spacing: { after: 100 },
          })
        );

        children.push(
          new Paragraph({
            text: `   Email: ${inquiry.email}`,
            spacing: { after: 50 },
          })
        );

        children.push(
          new Paragraph({
            text: `   Category: ${inquiry.category} | Status: ${inquiry.status}`,
            spacing: { after: 200 },
          })
        );
      });
    }

    // Create document
    const doc = new Document({
      sections: [
        {
          properties: {},
          children: children,
        },
      ],
    });

    // Generate buffer
    const buffer = await Packer.toBuffer(doc);
    return buffer;
  } catch (error) {
    throw error;
  }
};

module.exports = {
  generatePDFReport,
  generateWordReport,
};

