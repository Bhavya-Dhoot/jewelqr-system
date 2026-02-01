# SOFTWARE ENGINEERING PROJECT SUBMISSION

---

## Jewelry QR Composition, Cloud Inventory & Dynamic Pricing System

**A Web-Based Solution for Jewelry Retail Management**

---

**Submitted By:** [Your Name]  
**Roll Number:** [Your Roll Number]  
**Branch:** Computer Science and Engineering (B.Tech III Year)  
**Semester:** 5th / 6th Semester  
**Subject:** Software Engineering  
**Submitted To:** [Faculty Name]  
**Date:** December 2024

---

## Table of Contents

1. [Project Title](#1-project-title)
2. [Abstract](#2-abstract)
3. [Problem Statement](#3-problem-statement)
4. [UI Screenshots (10 Pages)](#4-ui-screenshots-10-pages)
5. [Work Breakdown Structure (WBS)](#5-work-breakdown-structure-wbs)
6. [Cost Estimation](#6-cost-estimation)
7. [RAD Methodology](#7-rad-methodology---rapid-application-development)
8. [Implementation Status](#8-implementation-status)

---

## 1. Project Title

### **Jewelry QR Composition, Cloud Inventory & Dynamic Pricing System**

The project aims to build a web-based application that helps jewelry shop owners manage their inventory using QR codes. Each jewelry item gets a unique QR code that stores its composition details like gold weight, purity, and diamond specifications. Customers can scan the QR code to see item details and get real-time pricing based on current gold and diamond rates.

---

## 2. Abstract

Managing jewelry inventory is a hassle for most small and medium jewelry retailers in India. They still rely on manual calculation of prices and paper-based records, which leads to errors and customer trust issues.

This project solves these problems by creating a QR-based inventory system. Here's how it works:

- **Shop owners** can create entries for each jewelry item with all composition details
- The system **generates a unique QR code** for each item
- **Customers** can scan the QR code using their phone and view item details
- They can enter **current gold/diamond rates** to calculate real-time prices
- The system supports different **diamond types** (Moti, Pear, Markish, Round) and **classifications** (Real vs CVD)

The frontend is built using plain HTML, CSS, and JavaScript - no heavy frameworks needed. I used QRCode.js library for generating QR codes and Html5QrcodeScanner for camera-based scanning.

The main benefit is transparency - customers can verify what they're paying for, and shop owners can maintain accurate records without manual paperwork.

---

## 3. Problem Statement

### Why This Project?

I observed the following problems in local jewelry shops:

1. **Price Calculation Errors**
   - Shop staff calculate prices manually using calculators
   - Different staff may quote different prices for the same item
   - Human error leads to disputes

2. **No Transparency**
   - Customers have no way to verify if the quoted gold weight is correct
   - Diamond quality claims cannot be verified
   - Trust issues between buyers and sellers

3. **Inventory Management**
   - Most shops use register books or Excel sheets
   - No easy way to search or track items
   - Difficult to audit stock

4. **Price Fluctuations**
   - Gold prices change daily
   - Staff must manually recalculate prices every morning
   - Old price tags cause confusion

5. **Diamond Classification**
   - Natural diamonds and CVD (lab-grown) diamonds have different prices
   - No system to distinguish and price them correctly
   - Different diamond shapes (Moti, Pear, etc.) need separate tracking

### My Solution

A QR-based web application that:
- Stores complete item composition in the QR code itself
- Allows real-time price calculation with current rates
- Works on any smartphone browser
- Requires no app installation
- Has admin controls for managing inventory and rates

---

## 4. UI Screenshots (10 Pages)

### Page 1: Landing Page

The homepage introduces the system and provides navigation to main features.

![Landing Page](screenshots/01_landing.png)

**Key Features:**
- Hero section with system tagline
- Navigation to Create, Scan, and Dashboard
- Quick access buttons

---

### Page 2: Login Page

Authentication page for staff and admin access.

![Login Page](screenshots/02_login.png)

**Key Features:**
- Username and password fields
- Demo account buttons for testing
- Error handling for invalid credentials

---

### Page 3: Create Item Page

The main form for creating new jewelry entries.

![Create Item Page](screenshots/03_create.png)

**Key Features:**
- Jewelry category dropdown (Chain, Bangles, Earrings, Necklace, Pendant Set, Others)
- Auto-generated SKU based on category
- Gold purity and weight inputs
- Diamond composition with type, source (Real/CVD), and weight
- QR code preview

---

### Page 4: Scan Page (Camera Interface)

Public interface for scanning QR codes.

![Scan Page](screenshots/04_scan.png)

**Key Features:**
- Camera access for QR scanning
- Manual SKU entry fallback
- Works with rear or front camera

---

### Page 5: Dashboard

Admin overview of inventory and statistics.

![Dashboard](screenshots/05_dashboard.png)

**Key Features:**
- Statistics cards (Total Items, Today's QR Count, etc.)
- Recent items table
- Quick navigation sidebar

---

### Page 6: Settings Page

System configuration for rates and categories.

![Settings Page](screenshots/06_settings.png)

**Key Features:**
- Diamond category management
- Default rate configuration (Gold, Real Diamond, CVD Diamond)
- Making charges and tax settings

---

### Page 7: Item Composition View (After Scan)

Shows the complete composition of a scanned item.

*Screenshot: Same as Scan Page - composition appears after successful scan*

**Displays:**
- SKU and item name
- Gold purity and weight
- Each diamond with type, source, and carat weight

---

### Page 8: Price Calculation Form

Rate entry form for calculating current price.

*Screenshot: Appears on Scan page after viewing composition*

**Inputs:**
- Gold rate per gram
- Diamond rate per carat (Real and CVD separately)
- Making charges
- Tax percentage

---

### Page 9: Price Breakdown View

Detailed cost breakdown after calculation.

*Screenshot: Result appears on Scan page*

**Shows:**
- Gold value breakdown
- Diamond value (Real + CVD separately)
- Making charges
- Tax amount
- Grand total

---

### Page 10: QR Generated Success State

Success view after creating an item.

*Screenshot: Appears on Create page after generation*

**Features:**
- Generated QR code display
- Download button
- Print option
- Create another item button

---

## 5. Work Breakdown Structure (WBS)

```
Jewelry QR System
│
├── 1.0 Requirements Analysis (Week 1)
│   ├── 1.1 Study existing jewelry shop workflows
│   ├── 1.2 List required features
│   └── 1.3 Select technology stack
│
├── 2.0 Design Phase (Week 2)
│   ├── 2.1 UI/UX Design
│   │   ├── 2.1.1 Create wireframes
│   │   ├── 2.1.2 Design color scheme
│   │   └── 2.1.3 Define component library
│   └── 2.2 System Architecture
│       ├── 2.2.1 Define page structure
│       └── 2.2.2 Plan data flow
│
├── 3.0 Frontend Development (Week 3-5) [COMPLETED]
│   ├── 3.1 Setup Project Structure
│   │   ├── 3.1.1 Create folder structure
│   │   ├── 3.1.2 Setup CSS design system
│   │   └── 3.1.3 Add external libraries
│   ├── 3.2 Build Pages
│   │   ├── 3.2.1 Landing page
│   │   ├── 3.2.2 Login page
│   │   ├── 3.2.3 Create item page
│   │   ├── 3.2.4 Scan page
│   │   ├── 3.2.5 Dashboard page
│   │   └── 3.2.6 Settings page
│   ├── 3.3 Add Features
│   │   ├── 3.3.1 QR code generation
│   │   ├── 3.3.2 QR code scanning
│   │   ├── 3.3.3 Price calculation logic
│   │   └── 3.3.4 Category management
│   └── 3.4 Testing
│       ├── 3.4.1 Test on Chrome, Firefox
│       └── 3.4.2 Test responsive layout
│
├── 4.0 Backend Development (Future Scope)
│   ├── 4.1 Build REST APIs
│   ├── 4.2 Database integration
│   └── 4.3 User authentication
│
└── 5.0 Documentation (Week 6)
    ├── 5.1 User manual
    └── 5.2 Technical docs
```

---

## 6. Cost Estimation

### COCOMO Model Calculation

I counted the lines of code in my project to estimate effort using the COCOMO model.

**Lines of Code (LOC) Count:**

| File Type | Number of Files | Lines of Code |
|-----------|-----------------|---------------|
| HTML files | 6 | ~1,800 |
| CSS files | 8 | ~2,400 |
| JavaScript files | 6 | ~2,200 |
| **Total** | **20** | **~6,400 LOC** |

**COCOMO Basic Model (Organic Project):**

```
Effort = a × (KLOC)^b

Where:
- a = 2.4 (organic project constant)
- b = 1.05
- KLOC = 6.4

Effort = 2.4 × (6.4)^1.05
Effort = 2.4 × 7.12
Effort ≈ 17 Person-Months
```

**Development Time:**

```
Time = c × (Effort)^d

Where:
- c = 2.5
- d = 0.38

Time = 2.5 × (17)^0.38
Time ≈ 6.5 Months
```

### Cost Breakdown

| Work Item | Estimated Hours | Rate (₹/hr) | Total (₹) |
|-----------|-----------------|-------------|-----------|
| UI Design | 40 hrs | 800 | 32,000 |
| HTML/CSS Coding | 80 hrs | 600 | 48,000 |
| JavaScript Logic | 100 hrs | 700 | 70,000 |
| QR Library Integration | 20 hrs | 700 | 14,000 |
| Testing & Fixes | 30 hrs | 500 | 15,000 |
| Documentation | 15 hrs | 400 | 6,000 |
| **Total (Frontend)** | **285 hrs** | | **₹1,85,000** |

### Full Project Estimate

| Phase | Cost Estimate |
|-------|---------------|
| Frontend (Current) | ₹1,85,000 |
| Backend (Future) | ₹2,50,000 |
| Database | ₹50,000 |
| Deployment | ₹75,000 |
| **Total Project** | **₹5,60,000** |

---

## 7. RAD Methodology - Rapid Application Development

I chose RAD methodology for this project because it allows quick prototyping and iterative development.

### Why RAD?

- The project needs a working demo quickly
- Requirements may change based on user feedback
- Frontend can be developed independently from backend

### RAD Phases in This Project

#### Phase 1: Requirements Planning
- Talked to local jewelers to understand their problems
- Listed must-have features vs nice-to-have features
- Decided to build frontend first, backend later

#### Phase 2: User Design
- Created rough sketches of all pages
- Picked a dark theme with gold accents (matches jewelry aesthetic)
- Built reusable components (buttons, cards, forms)

#### Phase 3: Construction (Iterative)

| Iteration | What I Built | Changes Made |
|-----------|--------------|--------------|
| 1 | Basic HTML pages | Just structure, no styling |
| 2 | CSS styling | Added dark theme, responsive layout |
| 3 | QR features | Integrated generation and scanning |
| 4 | Navigation | Added navbar, sidebar, auth |
| 5 | Categories & Diamonds | Added all dropdowns and calculation |

#### Phase 4: Cutover (Pending)
- Deploy to web server
- Get feedback from actual jewelry shop
- Plan backend integration

### Advantages of RAD for This Project

1. **Quick Results** - Working prototype in 4-5 weeks
2. **Easy to Change** - Can add features without breaking existing code
3. **User Feedback** - Can show demo to jewelers and incorporate suggestions
4. **Low Risk** - If something doesn't work, easy to rollback

---

## 8. Implementation Status

### What's Done

| Feature | Status |
|---------|--------|
| Landing Page | ✅ Complete |
| Login Page | ✅ Complete |
| Create Item Form | ✅ Complete |
| QR Code Generation | ✅ Complete |
| Scan Page with Camera | ✅ Complete |
| Price Calculation | ✅ Complete |
| Dashboard | ✅ Complete |
| Settings Page | ✅ Complete |
| Navigation System | ✅ Complete |
| Responsive Design | ✅ Complete |

### Technology Used

- **HTML5** - Page structure
- **CSS3** - Styling (custom design system, no frameworks)
- **JavaScript (ES6)** - Application logic
- **QRCode.js** - QR code generation library
- **Html5-qrcode** - Camera-based QR scanning
- **LocalStorage** - For storing settings (mock database)

### How to Run

1. Open command prompt in project folder
2. Run: `python -m http.server 8000`
3. Open browser: `http://localhost:8000`

### Demo Credentials

| Role | Username | Password |
|------|----------|----------|
| Admin | admin | admin123 |
| Staff | staff | staff123 |

---

## References

1. Pressman, R. S. (2014). *Software Engineering: A Practitioner's Approach*. McGraw-Hill.
2. Sommerville, I. (2015). *Software Engineering*. Pearson.
3. QRCode.js Documentation - https://davidshimjs.github.io/qrcodejs/
4. Html5-qrcode Library - https://github.com/mebjas/html5-qrcode

---

## Appendix

### A. Project File Structure

```
jewelry-qr-frontend/
├── index.html
├── login.html
├── create.html
├── scan.html
├── dashboard.html
├── settings.html
├── css/
│   ├── design-system.css
│   ├── components.css
│   ├── landing.css
│   ├── create.css
│   ├── scan.css
│   ├── dashboard.css
│   ├── login.css
│   └── nav.css
├── js/
│   ├── auth.js
│   ├── config.js
│   ├── create.js
│   ├── scan.js
│   ├── dashboard.js
│   ├── utils.js
│   └── components.js
└── screenshots/
    └── [UI Screenshots]
```

### B. QR Code Data Format

```json
{
  "sku": "CHN-123456",
  "category": "Chain",
  "purity": "22K",
  "gold_weight_g": 15.5,
  "diamonds": [
    {
      "type": "Moti",
      "source": "Real (Natural)",
      "weight_ct": 0.5
    }
  ]
}
```

---

*Document submitted as part of Software Engineering coursework, December 2024*
