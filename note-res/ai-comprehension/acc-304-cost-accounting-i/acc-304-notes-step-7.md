# Non-Manufacturing Overheads: Selling and Administrative

> [!abstract] Curriculum & Syllabus Context
> - **Course:** ACC 304 Cost Accounting I
> - **Syllabus Topic:** 8. Selling and Administrative Overhead
> - **Target Reading:** Datar & Rajan, *Horngren's Cost Accounting* (Chapter 14)
> - **Syllabus Focus:** Definition, classification, and accounting treatment of non-manufacturing (period) costs; Selling (marketing/distribution) vs. Administrative expenses; financial presentation under marginal vs. absorption formats; full product cost analysis across the six value-chain functions for long-run pricing; value engineering; cost incurrence vs. locked-in (designed-in) costs; and Target Costing gap analysis.

---
## 1. Nature and Classification of Non-Manufacturing (Period) Costs
### 1.1 Conceptual Foundations & GAAP/IFRS Accounting Treatment
In cost accounting, costs are broadly divided into **inventoriable (product) costs** and **period (non-manufacturing) costs**:

> [!info] Key Definition
>
> - **Inventoriable (Product) Costs:** All costs incurred in acquiring or manufacturing products. For manufacturing firms, these consist of direct materials, direct manufacturing labor, and manufacturing overhead (MOH). Under GAAP and International Accounting Standard 2 (**IAS 2: Inventories**), inventoriable costs are capitalized as assets on the Balance Sheet (in Work-in-Process and Finished Goods inventories) and are expensed on the Income Statement as **Cost of Goods Sold (COGS)** *only when the units are sold*.
> - **Period (Non-Manufacturing) Costs:** All costs in the Income Statement other than COGS. These costs are expensed in the accounting period in which they are incurred because they are presumed to benefit the current period rather than future inventory assets.

Non-manufacturing overheads encompass all business function costs outside the manufacturing line, primarily grouped into **Selling (Marketing & Distribution) Expenses** and **Administrative Expenses**:

$$\text{Total Non-Manufacturing Overhead} = \text{Selling Costs} + \text{Administrative Costs}$$

```mermaid
graph TD
    A[TOTAL ORGANIZATIONAL COSTS] --> B[INVENTORIABLE / PRODUCT COSTS<br>Capitalized on Balance Sheet]
    A --> C[PERIOD / NON-MANUFACTURING COSTS<br>Expensed directly on Income Statement]

    B --> D[Direct Materials]
    B --> E[Direct Labor]
    B --> F[Manufacturing Overhead]

    C --> G[Selling & Marketing Expenses]
    C --> H[Administrative Expenses]

    style A fill:#1D3557,color:#fff
    style B fill:#457B9D,color:#fff
    style C fill:#E63946,color:#fff
```

---
### 1.2 Categorization of Non-Manufacturing Overheads
#### A. Selling and Marketing Costs
Selling costs include all expenses necessary to secure customer orders and deliver the finished product or service to the customer:
1. **Order-Getting Costs:** Expenses incurred in seeking and securing demand (e.g., advertising campaigns, sales representative salaries, commissions, marketing travel, trade show displays, sample distributions).
2. **Order-Filling (Distribution) Costs:** Expenses incurred in storing, packaging, shipping, and delivering completed goods to buyers (e.g., finished goods warehouse rent, shipping freight-out, outbound logistics, delivery truck depreciation, fuel).
3. **After-Sales Service Costs:** Expenses associated with maintaining customer satisfaction post-sale (e.g., customer service hotlines, warranty repairs, replacement parts, return handling).
#### B. Administrative Costs
Administrative costs include all executive, organizational, legal, financial, human resources, and clerical expenses that support the organization as a whole rather than a specific operational function:
- Executive compensation (CEO, CFO, Board of Directors salaries)
- Corporate headquarters lease, utilities, and building depreciation
- Legal fees, external audit fees, and corporate governance compliance
- Human Resources (HR), Information Technology (IT) infrastructure, and general accounting staff payroll

---
### 1.3 Behavior and Mathematical Structure of Operating Expenses
> [!quote] Formula & Derivation
>
> Like manufacturing overhead, non-manufacturing costs exhibit variable, fixed, and mixed behavior within a relevant range:
>$$\text{Total Non-Manufacturing Costs } (Y) = F_{\text{non-mfg}} + (V_{\text{non-mfg}} \times X)$$
> Where:
> - $F_{\text{non-mfg}} = \text{Fixed non-manufacturing costs (e.g., corporate lease, fixed executive salaries, base software licenses)}$
> - $V_{\text{non-mfg}} = \text{Variable non-manufacturing cost per driver unit (e.g., sales commission percentage, freight cost per cubic foot)}$
> - $X = \text{Cost driver activity level (e.g., total revenues, units sold, cubic feet shipped, sales orders)}$

#### Comparison of Cost Behavior Patterns:

| Cost Category | Behavior in Total (within Relevant Range) | Behavior Per Unit (within Relevant Range) | Primary Cost Driver |
| :--- | :--- | :--- | :--- |
| **Variable Selling Cost** | Changes in direct proportion to activity | Constant per unit sold | Units sold, Sales revenue ($) |
| **Fixed Selling Cost** | Constant in total regardless of output | Decreases as unit volume increases | Long-run capacity decisions |
| **Variable Admin Cost** | Changes with transactional activity | Constant per transaction/order | Number of invoices, orders processed |
| **Fixed Admin Cost** | Constant in total across relevant range | Decreases as organizational scale grows | Overall corporate scale |

---
### 1.4 Financial Statement Presentation: Marginal vs. Absorption Formats
In financial accounting, period costs are deducted below **Gross Margin**. In managerial accounting (Contribution Margin format), variable period costs are grouped with variable manufacturing costs to compute **Contribution Margin**, while fixed period costs are grouped with fixed manufacturing costs:

> [!quote] Formula & Derivation
>
> #### Comparison of Financial Statement Layouts:
>$$
> \begin{aligned}
> \text{Financial Accounting (Absorption / GAAP):} \quad &\text{Revenues} - \text{COGS (Variable + Fixed Mfg)} = \mathbf{\text{Gross Margin}} \\
> &\mathbf{\text{Gross Margin}} - \text{Operating Expenses (Selling + Admin)} = \mathbf{\text{Operating Income}} \\
> \\
> \text{Managerial Accounting (Variable / CVP):} \quad &\text{Revenues} - \text{Variable Costs (Mfg + Selling + Admin)} = \mathbf{\text{Contribution Margin}} \\
> &\mathbf{\text{Contribution Margin}} - \text{Fixed Costs (Mfg + Selling + Admin)} = \mathbf{\text{Operating Income}}
> \end{aligned}
>$$

---
## 2. Value-Chain Cost Allocation & Long-Run Full Product Costing (Horngren Ch 14)
### 2.1 The Value Chain Framework
While financial reporting restricts product costs strictly to manufacturing costs incurred within the factory fence, strategic decision-making (such as pricing, product design, and customer profitability) requires evaluating costs across all six primary business functions of the **Value Chain**:

```mermaid
flowchart LR
    A[R&D] --> B[Design]
    B --> C[Production]
    C --> D[Marketing]
    D --> E[Distribution]
    E --> F[Customer Service]

    style C fill:#D90429,color:#FFF,stroke:#333,stroke-width:3px

    subgraph GAAP Inventoriable
    C
    end

    subgraph Period Expenses
    A
    B
    D
    E
    F
    end
```

1. **Research and Development (R&D):** Generating and experimenting with ideas related to new products, services, or processes.
2. **Design of Products and Processes:** Detailed planning, engineering, and testing of products and manufacturing/service processes.
3. **Production:** Procuring, storing, assembling, and processing raw materials into finished outputs (the only stage included in GAAP inventoriable costs).
4. **Marketing:** Promoting, advertising, and selling products or services to customers.
5. **Distribution:** Processing orders and physically delivering products or services to customers (logistics).
6. **Customer Service:** Providing post-sales support, warranty repairs, and assistance to customers.

---
### 2.2 Product Costs for Different Purposes
The definition of a "product cost" is not uniform; it depends entirely on the purpose for which the cost measurement is required:

| Financial Statements (GAAP/IFRS) | Government Contracts (Cost-Plus) | Pricing & Product-Mix (Strategic Mgmt) |
| :--- | :--- | :--- |
| • Production (Mfg) Costs Only (DM + DL + MOH) | • Production Costs<br>• Design Costs<br>• Approved R&D Portion<br>*(Excludes Marketing & Sales)* | • R&D Costs<br>• Design Costs<br>• Production Costs<br>• Marketing Costs<br>• Distribution Costs<br>• Customer Service Costs |

$$\text{Full Product Cost} = \text{Cost}_{\text{R\&D}} + \text{Cost}_{\text{Design}} + \text{Cost}_{\text{Production}} + \text{Cost}_{\text{Marketing}} + \text{Cost}_{\text{Distribution}} + \text{Cost}_{\text{Customer Service}}$$

> [!warning] Exam Pitfall / Exception
>
> **Strategic Pricing Trap:** In the long run, an enterprise must set selling prices that cover the **full product cost** across the entire value chain plus an adequate return on investment (ROI). If a firm prices products based solely on manufacturing costs, it risks underpricing items that consume heavy R&D, design, or distribution resources.

---
### 2.3 Value Engineering, Target Costing, and Cost Lock-In
#### A. Value-Added vs. Non-Value-Added Costs
To optimize full product costs, management accountants perform **value engineering**:

> [!info] Key Definition
>
> - **Value-Added Cost:** A cost that, if eliminated, would reduce the actual or perceived usefulness or utility customers gain from using the product or service (e.g., high-grade materials, precision machining, essential performance features).
> - **Non-Value-Added Cost:** A cost that, if eliminated, would not reduce the utility or value experienced by the customer (e.g., storage/warehousing costs, idle machine time, rework labor, inspection delays, scrap).

#### B. Cost Incurrence vs. Locked-In (Designed-In) Costs
A crucial insight in value engineering is the temporal disconnect between **cost incurrence** and **cost lock-in**:
- **Cost Incurrence:** Occurs when a resource is physically consumed or spent (e.g., paying for raw materials during assembly).
- **Locked-In (Designed-In) Costs:** Costs that have not yet been incurred, but will be incurred in the future based on decisions that have already been made in the design and engineering phase.

```mermaid
xychart-beta
    title "Cumulative Cost Incurrence vs. Cost Lock-In"
    x-axis "Value Chain Stages" ["R&D", "Design", "Manufacturing", "Distribution", "Customer Svc"]
    y-axis "Percentage of Total Cost (%)" 0 --> 100
    line "Cumulative Cost Locked-In" [60, 85, 95, 100, 100]
    line "Cumulative Cost Incurred" [10, 20, 80, 95, 100]
```

> [!warning] Exam Pitfall / Exception
>
> Over **80% of a product's full life-cycle cost** is locked in during the R&D and Design phases. Once a product is designed with a specific number of parts, material types, and structural specifications, manufacturing managers can only make minor operational savings. Value engineering must therefore occur *during product design*.

#### C. Target Costing Mechanics
Target costing is a market-driven approach to long-run pricing and cost management:

> [!quote] Formula & Derivation
>
> 1. **Determine Target Price:** Based on customer research and competitor pricing in the marketplace.
> 2. **Determine Target Operating Income Per Unit:** Based on the firm's required Rate of Return on Investment ($\text{Target ROI}$).
>$$\text{Target Operating Income Per Unit} = \frac{\text{Target ROI} \times \text{Total Invested Capital}}{\text{Projected Unit Volume}}$$
> 3. **Calculate Target Cost Per Unit:**
>$$\text{Target Cost Per Unit} = \text{Target Selling Price} - \text{Target Operating Income Per Unit}$$
> 4. **Value Engineering Gap Analysis:**
>$$\text{Cost Reduction Target} = \text{Current Estimated Full Product Cost} - \text{Target Cost Per Unit}$$
>    If the current estimated full cost exceeds the target cost, the cross-functional team must apply value engineering to close the gap before committing to production.

---
## 3. Comprehensive Numerical Walkthroughs & Solutions

---

> [!example] Numerical Problem & Solution
>
> ### Walkthrough Problem 1: Full Value-Chain Product Costing, Target Costing, and Life-Cycle Pricing
> *Adapted from Horngren Chapter 14 (Astel Computers / Provalue Example)*
> #### Scenario Setup:
> Apex Tech Corporation manufactures high-performance tablet devices. In 2025, Apex is preparing to launch a new tablet model, the **"Apex Tab-V"**. Projected annual production and sales volume is **100,000 units**. Apex has no beginning or ending inventories.
> The management team requires a comprehensive value-chain cost analysis to establish a long-run selling price and perform target costing.
> #### Value-Chain Activity Data & Cost Drivers for Apex Tab-V:
> 1. **Direct Manufacturing Costs:**
>    - Direct Materials: $1 \text{ component kit per unit}$ @ $\$250 \text{ per kit} = \$250 \text{ per unit}$
>    - Direct Manufacturing Labor: $2 \text{ DML-hours per unit}$ @ $\$25 \text{ per DML-hour} = \$50 \text{ per unit}$
>    - Direct Machining Equipment Lease (Dedicated): $200,000 \text{ machine-hours}$ allocated @ $\$15 \text{ per machine-hour} = \$3,000,000 \text{ total} (\$30 \text{ per unit})$
> 2. **Manufacturing Overhead Cost Pools (ABC):**
>    - **Ordering & Receiving:** 400 total component orders @ $\$120 \text{ per order} = \$48,000 \text{ total}$
>    - **Testing & Quality Inspection:** $200,000 \text{ testing-hours}$ @ $\$3 \text{ per testing-hour} = \$600,000 \text{ total}$
>    - **Rework Costs:** Defect rate is $5\%$ of output ($5,000 \text{ defective units}$). Each defective unit requires $3 \text{ rework-hours}$ @ $\$30 \text{ per rework-hour} = \$90 \text{ per defective unit} \times 5,000 = \$450,000 \text{ total}$
> 3. **Non-Manufacturing Value-Chain Cost Pools:**
>    - **Research & Development (R&D):** Fixed cost = $\$1,200,000$
>    - **Design of Products & Processes:** Fixed cost = $\$800,000$
>    - **Marketing & Advertising:** Variable commission of $\$10 \text{ per unit sold} + \text{Fixed advertising} \text{ of } \$1,500,000 = \$2,500,000 \text{ total}$
>    - **Distribution Logistics:** $20,000 \text{ cubic feet shipped}$ @ $\$45 \text{ per cubic foot} = \$900,000 \text{ total}$
>    - **Customer Service:** $100,000 \text{ units supported}$ @ $\$6 \text{ per unit} = \$600,000 \text{ total}$
> #### Required:
> 4. Calculate the **Total Manufacturing Cost** and **Manufacturing Cost Per Unit** for the Apex Tab-V.
> 5. Calculate the **Full Product Cost** across the entire value chain and the **Full Cost Per Unit**.
> 6. If Apex desires a **$20\%$ markup on the Full Product Cost**, calculate the prospective long-run target selling price per unit.
> 7. **Target Costing Application:** Suppose market research indicates competitors are selling similar tablets for **$420 per unit**. To meet market competition, Apex sets a **Target Price of $420 per unit**. If Apex requires a **target operating income margin of $15\%$ of selling price**, calculate:
>    - Target Operating Income Per Unit
>    - Target Cost Per Unit
>    - The required **Cost Reduction Target (Gap)** that value engineering must eliminate.
>
> ### Step-by-Step Solution:
> #### Requirement 1: Manufacturing Cost Analysis (Inventoriable Cost under GAAP)
> $$
> \begin{aligned}
> \text{Direct Materials} &= 100,000 \text{ units} \times \$250 = \$25,000,000 \\
> \text{Direct Manufacturing Labor} &= 100,000 \text{ units} \times (2 \text{ hrs} \times \$25) = \$5,000,000 \\
> \text{Direct Machining Lease} &= 200,000 \text{ machine-hrs} \times \$15 = \$3,000,000 \\
> \hline
> \mathbf{\text{Total Direct Manufacturing Costs}} &= \mathbf{\$33,000,000} \quad (\$330.00 \text{ per unit}) \\
> \\
> \text{MOH: Ordering \& Receiving} &= 400 \text{ orders} \times \$120 = \$48,000 \\
> \text{MOH: Testing \& Inspection} &= 200,000 \text{ hrs} \times \$3 = \$600,000 \\
> \text{MOH: Rework Costs} &= 5,000 \text{ defective units} \times (3 \text{ hrs} \times \$30) = \$450,000 \\
> \hline
> \mathbf{\text{Total Manufacturing Overhead Costs}} &= \mathbf{\$1,098,000} \quad (\$10.98 \text{ per unit}) \\
> \\
> \mathbf{\text{Total Manufacturing Cost}} &= \$33,000,000 + \$1,098,000 = \mathbf{\$34,098,000} \\
> \mathbf{\text{Manufacturing Cost Per Unit}} &= \frac{\$34,098,000}{100,000 \text{ units}} = \mathbf{\$340.98 \text{ per unit}}
> \end{aligned}
> $$
>
> ---
> ##### Requirement 2: Full Value-Chain Product Cost Analysis
> $$
> \begin{aligned}
> \text{Total Manufacturing Costs (Production)} &= \$34,098,000 \\
> \text{Research \& Development (R\&D)} &= \$1,200,000 \\
> \text{Design of Products \& Processes} &= \$800,000 \\
> \text{Marketing \& Advertising} &= (100,000 \times \$10) + \$1,500,000 = \$2,500,000 \\
> \text{Distribution Logistics} &= 20,000 \text{ cu. ft.} \times \$45 = \$900,000 \\
> \text{Customer Service} &= 100,000 \text{ units} \times \$6 = \$600,000 \\
> \hline
> \mathbf{\text{Full Product Cost (Total Value Chain)}} &= \mathbf{\$40,098,000} \\
> \mathbf{\text{Full Cost Per Unit}} &= \frac{\$40,098,000}{100,000 \text{ units}} = \mathbf{\$400.98 \text{ per unit}}
> \end{aligned}
> $$
>
> ---
> ##### Requirement 3: Prospective Cost-Plus Target Selling Price
> $$\text{Markup Component} = 20\% \times \$400.98 = \$80.196 \text{ per unit}$$
>
> $$\mathbf{\text{Target Selling Price}} = \$400.98 + \$80.20 = \mathbf{\$481.18 \text{ per unit}}$$
>
> ---
> ##### Requirement 4: Target Costing & Gap Analysis
> 1. **Target Operating Income Per Unit:**
> $$\text{Target Operating Income} = 15\% \times \$420.00 = \mathbf{\$63.00 \text{ per unit}}$$
> 2. **Target Cost Per Unit:**
> $$\text{Target Cost Per Unit} = \text{Target Selling Price} - \text{Target Operating Income}$$
> $$\text{Target Cost Per Unit} = \$420.00 - \$63.00 = \mathbf{\$357.00 \text{ per unit}}$$
> 3. **Cost Reduction Target (Gap):**
> $$\text{Cost Gap} = \text{Current Full Cost Per Unit} - \text{Target Cost Per Unit}$$
> $$\mathbf{\text{Cost Gap}} = \$400.98 - \$357.00 = \mathbf{\$43.98 \text{ per unit}} \quad (\text{or } \$4,398,000 \text{ in total})$$
>
> *Management Action:* Value engineering must redesign the product to reduce parts complexity, eliminate non-value-added testing/rework, or negotiate lower component kit prices to cut $\$43.98$ per unit before commercial production begins.
>
> ---
## 4. Summary of Key Non-Manufacturing Overhead Formulas
> [!quote] Formula & Derivation
>
>$$
> \begin{aligned}
> \text{Full Product Cost} &= \text{Cost}_{\text{R\&D}} + \text{Cost}_{\text{Design}} + \text{Cost}_{\text{Production}} + \text{Cost}_{\text{Marketing}} + \text{Cost}_{\text{Distribution}} + \text{Cost}_{\text{Customer Service}} \\
> \text{Target Cost Per Unit} &= \text{Target Selling Price} - \text{Target Operating Income Per Unit} \\
> \text{Cost Reduction Target (Gap)} &= \text{Current Estimated Full Cost} - \text{Target Cost Per Unit} \\
> \text{Customer Net Revenue} &= \text{Gross List Revenue} - \text{Price Discounts Granted} \\
> \text{Customer Gross Margin} &= \text{Customer Net Revenue} - \text{COGS} \\
> \text{Customer Operating Income} &= \text{Customer Gross Margin} - \text{Total Customer-Level ABC Costs} \\
> \text{Total Customer ABC Costs} &= \sum (\text{Actual Activity Usage} \times \text{Activity Cost Rate})
> \end{aligned}
>$$
