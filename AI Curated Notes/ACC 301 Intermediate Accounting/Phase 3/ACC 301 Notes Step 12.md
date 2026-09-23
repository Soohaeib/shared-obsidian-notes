# Owners' Equity & Dividends

> [!abstract] Curriculum & Syllabus Context
>
> - **Course:** ACC 301 Intermediate Accounting
> - **Phase:** Phase 3: Liabilities & Owners' Equity
> - **Target Reading:** Weygandt, Kieso, and Warfield, *Intermediate Accounting*, 18th Edition — **Chapter 14: Stockholders' Equity**
> - **Syllabus Focus:** Corporate capital structure, rights of common shareholders, par/stated vs. no-par stock, lump-sum issuance allocations (proportional vs. incremental), noncash stock issuances, preferred stock characteristics (cumulative, participating, convertible, mandatorily redeemable debt classification under ASC 480), treasury stock cost method, cash/property/liquidating dividends, stock dividends vs. stock splits, and equity ratios (ROE, payout, book value per share).

---

### 1. Nature & Characteristics of Corporate Capital
#### Corporate Form and Stockholders' Rights
A corporation is a distinct legal entity created under state corporate law. Ownership in a corporation is evidenced by shares of transferable capital stock. In the absence of restrictive provisions, each share of stock carries four fundamental rights:
1. **Profit Allocation (Dividend Right)**: The right to share proportionately in profits and losses through dividends when declared by the board of directors.
2. **Management Participation (Voting Right)**: The right to vote in the election of the board of directors and on major corporate matters (e.g., mergers, charter amendments) at stockholders' meetings.
3. **Liquidation Right**: The right to share proportionately in corporate assets remaining after the full satisfaction of all creditor claims upon corporate liquidation.
4. **Preemptive Right**: The right to purchase a proportionate share of any new issuance of stock of the same class to protect the existing shareholder against involuntary ownership dilution.

---
#### Components of Stockholders' Equity
Stockholders' equity represents the residual interest in the assets of a corporation after deducting all liabilities.

> [!quote] Formula & Derivation: Total Stockholders' Equity
>
> $$ \text{Total Stockholders' Equity} = \text{Contributed Capital} + \text{Earned Capital} - \text{Treasury Stock} \pm \text{AOCI} $$

```mermaid
mindmap
  root((Total Stockholders' Equity))
    Contributed (Paid-in) Capital
      Capital Stock
        Preferred Stock (Par/Stated)
        Common Stock (Par/Stated)
      Additional Paid-in Capital (APIC)
        APIC - Preferred
        APIC - Common
        APIC - Treasury
    Earned Capital
      Retained Earnings
        Unappropriated
        Appropriated / Restricted
    Adjustments
      Treasury Stock (Contra-Equity)
      Accumulated Other Comprehensive Income (AOCI)
```

1. **Contributed (Paid-in) Capital**: The total amount invested by stockholders in return for shares of stock.
   - **Capital Stock**: Represents the par or stated value of issued shares (Preferred Stock and Common Stock).
   - **Additional Paid-in Capital (APIC)**: Represents the excess of issue price over the par or stated value of shares issued, as well as capital from treasury stock transactions, stock options, and conversions.
2. **Earned Capital (Retained Earnings)**: The cumulative net income earned by the corporation since inception, reduced by net losses, cash/property/stock dividends declared, and transfers to capital stock.
3. **Accumulated Other Comprehensive Income (AOCI)**: The aggregate balance of cumulative non-owner changes in equity, including unrealized holding gains/losses on Available-for-Sale debt securities, pension plan actuarial gains/losses and prior service costs, and foreign currency translation adjustments.

---
### 2. Accounting for Capital Stock Issuances
#### Par Value, No-Par, and Stated Value Stock
- **Par Value Stock**: Par value is an arbitrary fixed amount per share specified in the corporate charter. It does not represent economic or fair market value. When par value stock is issued, the **Capital Stock** account is credited for the aggregate par value, and any excess proceeds are credited to **Paid-in Capital in Excess of Par**.
- **No-Par Stock**: Stock issued without a designated par value. The entire proceeds received from issuance are credited directly to the **Common Stock** (or Preferred Stock) account.
- **No-Par Stock with Stated Value**: State laws often permit boards of directors to establish a "stated value" for no-par stock. Accounting treatment parallels par value stock: stated value is credited to **Common Stock**, and proceeds in excess of stated value are credited to **Paid-in Capital in Excess of Stated Value**.
#### Lump-Sum (Basket) Issuances
When two or more classes of securities (e.g., common stock and preferred stock) are issued for a single lump-sum payment, the total proceeds must be allocated among the individual classes using one of two methods:

> [!quote] Formula & Derivation: Lump-Sum Allocation Methods
>
> **1. Proportional Method**
> Applied when the fair market value of every class of security is known.
> $$ \text{Allocated Cost} = \text{Lump-Sum Proceeds} \times \left( \frac{\text{Aggregate Fair Value of Class}}{\text{Total Aggregate Fair Value of All Classes}} \right) $$
> **2. Incremental Method**
> Applied when the fair value of only one class of security is determinable. The known fair value is allocated to that security, and the remaining (incremental) balance of the lump-sum proceeds is allocated to the security with the unknown fair value.

---

> [!example] Numerical Problem: Lump-Sum Issuances
>
> **Scenario**: Corporate Titan Inc. issues $1,000$ shares of $\$10$ par value Preferred Stock and $2,000$ shares of $\$5$ par value Common Stock for a single lump-sum payment of $\$100,000$.
> ##### Case A: Both Fair Values Known (Proportional Method)
> - Preferred market value = $\$60$/share $\rightarrow \text{Aggregate FV} = 1,000 \times \$60 = \$60,000$.
> - Common market value = $\$25$/share $\rightarrow \text{Aggregate FV} = 2,000 \times \$25 = \$50,000$.
> - Total Aggregate Fair Value = $\$60,000 + \$50,000 = \$110,000$.
> **Allocations**:
> $$ \text{Preferred} = \$100,000 \times \left( \frac{\$60,000}{\$110,000} \right) = \mathbf{\$54,545.45} $$
> $$ \text{Common} = \$100,000 \times \left( \frac{\$50,000}{\$110,000} \right) = \mathbf{\$45,454.55} $$
> **Journal Entry**:
> $$ \begin{array}{llrr}
> \textbf{Account Titles} & & \textbf{Debit (\$)} & \textbf{Credit (\$)} \\
> \hline
> \text{Cash} & & 100,000.00 & \\
> \quad \text{Preferred Stock } (1,000 \times \$10 \text{ par}) & & & 10,000.00 \\
> \quad \text{Paid-in Capital in Excess of Par - Preferred} & & & 44,545.45 \\
> \quad \text{Common Stock } (2,000 \times \$5 \text{ par}) & & & 10,000.00 \\
> \quad \text{Paid-in Capital in Excess of Par - Common} & & & 35,454.55 \\
> \end{array} $$
> ##### Case B: Only Common Stock Fair Value Known (Incremental Method)
> - Common market value = $\$25$/share $\rightarrow \text{Allocated to Common} = 2,000 \times \$25 = \$50,000$.
> - Preferred market value is unknown. Incremental allocation = $\$100,000 - \$50,000 = \mathbf{\$50,000}$.
> **Journal Entry**:
> $$ \begin{array}{llrr}
> \textbf{Account Titles} & & \textbf{Debit (\$)} & \textbf{Credit (\$)} \\
> \hline
> \text{Cash} & & 100,000 & \\
> \quad \text{Common Stock } (2,000 \times \$5 \text{ par}) & & & 10,000 \\
> \quad \text{Paid-in Capital in Excess of Par - Common} & & & 40,000 \\
> \quad \text{Preferred Stock } (1,000 \times \$10 \text{ par}) & & & 10,000 \\
> \quad \text{Paid-in Capital in Excess of Par - Preferred} & & & 40,000 \\
> \end{array} $$

---
#### Stock Issued in Noncash Transactions
When capital stock is issued for property, land, equipment, or services:
- **General Valuation Rule**: Record the transaction at the **fair value of the consideration received** or the **fair value of the stock issued**, whichever is more clearly determinable.
- **Watered Stock**: Occurs when assets received for stock are intentionally overvalued on the balance sheet, inflating stockholders' equity.
- **Secret Reserves**: Occurs when assets received are undervalued or liabilities are overvalued, understating stockholders' equity.
#### Issuance Costs
Direct costs incurred in issuing stock—such as underwriting commissions, legal fees, accounting fees, and prospectus printing costs—are treated as a **reduction of the cash proceeds** received. They are debited against **Paid-in Capital in Excess of Par** and are **never capitalized as intangible assets** or expensed.

---
### 3. Preferred Stock Features & Accounting
#### Characteristics of Preferred Stock
Preferred stock is an equity security that confers specific preferences over common stock, primarily:
1. **Dividend Preference**: Right to receive dividends at a specified rate (percentage of par or fixed dollar amount) before any distribution is made to common shareholders.
2. **Liquidation Preference**: Priority claim over common shareholders to corporate assets in the event of involuntary or voluntary liquidation.
#### Special Features Matrix
- **Cumulative Preferred Stock**: If the board fails to declare a dividend in any year, the unpaid dividend accumulates as a **dividend in arrears**. Dividends in arrears are **not legal liabilities** (since no dividend was declared) but must be fully disclosed in notes and paid in full prior to any common distributions.
- **Noncumulative Preferred Stock**: Unpaid dividends in any passed year are permanently lost.
- **Participating Preferred Stock**: Entitles holders to share with common shareholders in additional distributions beyond the basic preferred rate:
  - *Fully Participating*: Participates proportionally across all remaining distributed capital after common receives a matching percentage rate.
  - *Partially Participating*: Participation is capped at a specified maximum percentage.
- **Convertible Preferred Stock**: Allows exchange for common stock at a predetermined ratio. Accounted for using the **Book Value Method** (no gain/loss recognized; carrying value of preferred is transferred to common stock and APIC).
- **Callable Preferred Stock**: Allows the issuing corporation to call/redeem the shares at specified dates and prices.

> [!warning] Exam Pitfall / Exception
>
> **Mandatorily Redeemable Preferred Stock**: Preferred stock that must be redeemed at a specified date or upon an event certain to occur. Under **ASC 480**, mandatorily redeemable preferred stock possesses the characteristics of debt and **must be classified as a Liability** on the balance sheet, NOT as equity.

---

> [!example] Numerical Problem: Complex Preferred Dividend Allocation
>
> **Scenario**: Apex Corp. has the following capital structure:
> - **Preferred Stock**: $5,000$ shares, $6\%$, $\$100$ par value ($\text{Total Par} = \$500,000$).
> - **Common Stock**: $20,000$ shares, $\$10$ par value ($\text{Total Par} = \$200,000$).
> - Total dividends declared in 2025 = $\$72,000$.
> - Preferred dividends are $2$ years in arrears prior to 2025.
> ##### Case 1: Cumulative, Nonparticipating
> 1. **Dividends in Arrears (2 years)**: $2 \times (6\% \times \$500,000) = \$60,000$.
> 2. **Current Year Preferred Dividend (2025)**: $6\% \times \$500,000 = \$30,000$.
>    - Total Preferred Requirement = $\$90,000$.
> 3. **Allocation of $\$72,000$ Declared**:
>    - Preferred receives all $\mathbf{\$72,000}$ ($\$60,000$ for arrears $+ \$12,000$ partial current).
>    - Remaining Dividends in Arrears carried forward = $\$30,000 - \$12,000 = \$18,000$.
>    - Common receives $\mathbf{\$0}$.
> ##### Case 2: Cumulative, Fully Participating (Assuming No Arrears)
> Assume dividends declared = $\$72,000$ and no arrears exist.
> 4. **Preferred Basic Dividend ($6\%$)**: $6\% \times \$500,000 = \$30,000$.
> 5. **Common Matching Dividend ($6\%$)**: $6\% \times \$200,000 = \$12,000$.
>    - Total Basic Allocation = $\$30,000 + \$12,000 = \$42,000$.
> 6. **Remaining Dividend Available for Participation**: $\$72,000 - \$42,000 = \$30,000$.
> 7. **Participation Rate**:
>    $$ \frac{\text{Remaining Dividend}}{\text{Total Par Value of Both Classes}} = \frac{\$30,000}{\$700,000} \approx 4.285714\% $$
> 8. **Participation Distribution**:
>    - Preferred Participation = $4.285714\% \times \$500,000 = \$21,428.57$
>    - Common Participation = $4.285714\% \times \$200,000 = \$8,571.43$
> 9. **Total Distribution Summary**:
>    - **Preferred Total**: $\$30,000 + \$21,428.57 = \mathbf{\$51,428.57}$ ($\$10.29\text{/share}$)
>    - **Common Total**: $\$12,000 + \$8,571.43 = \mathbf{\$20,571.43}$ ($\$1.03\text{/share}$)

---
### 4. Reacquisition of Shares: Treasury Stock
#### Rationale for Stock Buybacks
Corporations reacquire their own outstanding shares for several strategic reasons:
1. To provide shares for employee stock option and compensation plans.
2. To enhance earnings per share (EPS) by reducing the denominator.
3. To return excess cash to shareholders efficiently.
4. To create a market for the stock or signal that shares are undervalued.
5. To thwart hostile takeover attempts by shrinking public float.
#### Nature & Status of Treasury Stock
> [!info] Key Definition
>
> **Treasury stock** is a corporation's own stock that was issued, fully paid, and subsequently reacquired by the company, but not retired.
> - **Contra-Equity Nature**: Treasury stock is **NOT an asset**. It is reported as a deduction from total stockholders' equity.
> - **Deprivation of Rights**: Treasury shares carry **no voting rights**, **no preemptive rights**, **no cash or property dividend rights**, and receive no distribution upon liquidation.

---
#### Cost Method Mechanics
Under the Cost Method (GAAP preferred), the Treasury Stock account is debited for the full acquisition cost regardless of par value.
1. **Purchase of Treasury Shares**: Debit `Treasury Stock` (at purchase cost), Credit `Cash`.
2. **Reissuance Above Cost**: The excess of price over cost is credited to `Paid-in Capital from Treasury Stock`. (Never recognize a gain on income statement).
3. **Reissuance Below Cost**: The shortfall is debited to `Paid-in Capital from Treasury Stock` up to its existing credit balance. Any remaining unabsorbed deficit is debited directly to `Retained Earnings`.
4. **Retirement of Treasury Stock**: Original Par and Original APIC are removed. Balancing goes to `Paid-in Capital from Treasury Stock` or `Retained Earnings`.

---

> [!example] Comprehensive Walkthrough: Treasury Stock Transactions
>
> **Initial Equity Context**: Zenith Corp. has $100,000$ shares of $\$5$ par common stock issued at $\$15$ per share ($\text{APIC} = \$10/\text{share}$). Retained Earnings = $\$500,000$.
> $$ \begin{array}{llrr}
> \textbf{Date} & \textbf{Account Titles} & \textbf{Debit (\$)} & \textbf{Credit (\$)} \\
> \hline
> \text{Jan 15} & \text{Treasury Stock } (5,000 \times \$20) & 100,000 & \\
> \text{(Purchase)} & \quad \text{Cash} & & 100,000 \\
> \hline
> \text{May 10} & \text{Cash } (2,000 \times \$25) & 50,000 & \\
> \text{(Sell > Cost)} & \quad \text{Treasury Stock } (2,000 \times \$20) & & 40,000 \\
> & \quad \text{Paid-in Capital from Treasury Stock} & & 10,000 \\
> \hline
> \text{Aug 20} & \text{Cash } (2,000 \times \$14) & 28,000 & \\
> \text{(Sell < Cost)} & \text{Paid-in Capital from Treasury Stock (Wipes out bal)} & 10,000 & \\
> & \text{Retained Earnings (Unabsorbed Deficit)} & 2,000 & \\
> & \quad \text{Treasury Stock } (2,000 \times \$20) & & 40,000 \\
> \hline
> \text{Nov 12} & \text{Common Stock (Par: } 1,000 \times \$5) & 5,000 & \\
> \text{(Retirement)} & \text{Paid-in Capital in Excess of Par - Com. } (1,000 \times \$10) & 10,000 & \\
> & \text{Retained Earnings } (\text{Plug for remaining cost excess}) & 5,000 & \\
> & \quad \text{Treasury Stock (Cost: } 1,000 \times \$20) & & 20,000 \\
> \hline \hline
> \end{array} $$

---
### 5. Dividend Policy & Distributions
#### Financial & Legal Drivers
- **Legal Requirements**: State corporate laws dictate that dividends can only be paid out of legal capital protections (typically requiring positive Retained Earnings / Earned Surplus).
- **Cash Liquidity**: A positive Retained Earnings balance does not equal cash. A company must possess sufficient uncommitted cash to pay a cash dividend.
- **Key Dividend Dates**:
  1. **Date of Declaration**: Board passes resolution. Creates a **legal liability** on this date. (`Dr. Retained Earnings`, `Cr. Dividends Payable`)
  2. **Date of Record**: Determination of registered owners. **No journal entry**.
  3. **Date of Payment**: Distribution of cash. (`Dr. Dividends Payable`, `Cr. Cash`)

---
#### Types of Dividends
##### 1. Cash Dividends
Pro-rata distribution of cash to common/preferred shareholders. Declared on outstanding shares only (excluding treasury shares).
##### 2. Property Dividends (Dividends in Kind)
Distribution of noncash assets (e.g., inventory, real estate, marketable securities of other entities).
- **Accounting Requirement**: Before recording the dividend liability, the distributed property **must be revalued to fair market value** as of the declaration date, with any resulting gain or loss recognized in Net Income.
- **Entry Sequence**:
  1. Restate to FV: `Dr. Asset`, `Cr. Gain on Property Revaluation`.
  2. Declare: `Dr. Retained Earnings`, `Cr. Property Dividends Payable` (at fair value).
  3. Payment: `Dr. Property Dividends Payable`, `Cr. Asset`.
##### 3. Liquidating Dividends
Dividends that exceed cumulative retained earnings represent a return of the shareholders' capital investment rather than a distribution of profits. The portion exceeding retained earnings is debited directly to **Paid-in Capital in Excess of Par**.
##### 4. Stock Dividends & Stock Splits
Distributions of a corporation's own stock to existing shareholders on a pro-rata basis without receiving consideration. Total stockholders' equity remains unchanged.

| Characteristic | Small Stock Dividend ($<20-25\%$) | Large Stock Dividend ($\ge 20-25\%$) | Stock Split (e.g., 2-for-1) |
| :--- | :--- | :--- | :--- |
| **Valuation Basis** | **Fair Market Value** at Declaration | **Par / Stated Value** | No entry (Memo only) |
| **Retained Earnings** | Debited for Fair Market Value | Debited for Par Value | Unchanged |
| **Total Equity** | Zero (Reclassification only) | Zero (Reclassification only) | Zero |
| **Par Value per Share** | Unchanged | Unchanged | Halved (reduced proportionally) |
| **Shares Outstanding** | Increases | Increases | Doubled |

*(Note: A "Stock Split Effected in the Form of a Dividend" issues new shares without formally changing par value in the charter. Par value is capitalized from Retained Earnings to Common Stock).*

---
### 6. Presentation, Analysis, & Financial Ratios
#### Statement of Stockholders' Equity Presentation
Under GAAP, companies present changes in each equity account in a matrix (columnar) format:

$$ \begin{array}{lrrrrrr}
\textbf{(in \$ thousands)} & \textbf{Pref. Stock} & \textbf{Common Stock} & \textbf{APIC} & \textbf{Ret. Earnings} & \textbf{Treasury Stock} & \textbf{Total Equity} \\
\hline
\text{Jan 1 Balance} & \$100,000 & \$200,000 & \$500,000 & \$800,000 & \$(50,000) & \$1,550,000 \\
\text{Net Income} & - & - & - & 150,000 & - & 150,000 \\
\text{Cash Dividends} & - & - & - & (40,000) & - & (40,000) \\
\text{Treasury Purchase} & - & - & - & - & (20,000) & (20,000) \\
\hline
\textbf{Dec 31 Balance} & \mathbf{\$100,000} & \mathbf{\$200,000} & \mathbf{\$500,000} & \mathbf{\$910,000} & \mathbf{\$(70,000)} & \mathbf{\$1,640,000} \\
\hline \hline
\end{array} $$

---
#### Key Equity Ratios & Formulas
> [!quote] Formula & Derivation: Equity Analysis Ratios
>
> **1. Return on Common Stockholders' Equity (ROE)**
> Measures corporate profitability generated per dollar of common equity invested:
> $$ \text{ROE} = \frac{\text{Net Income} - \text{Preferred Dividends}}{\text{Average Common Stockholders' Equity}} $$
> *(Common Equity = Total Equity - Preferred Stock Liquidation Value - Preferred Dividends in Arrears).*
> **2. Dividend Payout Ratio**
> Measures the percentage of net earnings distributed to common shareholders as cash dividends:
> $$ \text{Payout Ratio} = \frac{\text{Cash Dividends Paid to Common Shareholders}}{\text{Net Income} - \text{Preferred Dividends}} $$
> **3. Book Value per Share**
> Represents the net asset value per outstanding common share upon liquidation:
> $$ \text{Book Value per Share} = \frac{\text{Common Stockholders' Equity}}{\text{Outstanding Common Shares}} $$

---

> [!example] Numerical Problem: Book Value per Share with Preferred Arrears
>
> **Scenario Data**:
> - Preferred Stock, $8\%$ cumulative, $\$100$ par, $2,000$ shares outstanding = $\$200,000$.
> - Preferred Liquidation Value = $\$105$ per share = $\$210,000$.
> - Preferred Dividends in Arrears = $3$ years (including current year) = $3 \times (8\% \times \$200,000) = \$48,000$.
> - Common Stock, $\$5$ par, $50,000$ shares issued, $5,000$ shares in treasury ($45,000$ shares outstanding) = $\$250,000$.
> - Paid-in Capital in Excess of Par - Common = $\$350,000$.
> - Retained Earnings = $\$400,000$.
> - Treasury Stock (Cost) = $(\$40,000)$.
> **Step 1: Calculate Total Stockholders' Equity**
> $$ \text{Total Equity} = \$200,000 + \$250,000 + \$350,000 + \$400,000 - \$40,000 = \mathbf{\$1,160,000} $$
> **Step 2: Allocate Equity to Preferred Shareholders**
> $$ \text{Preferred Claim} = \text{Liquidation Value} + \text{Dividends in Arrears} = \$210,000 + \$48,000 = \mathbf{\$258,000} $$
> **Step 3: Calculate Equity Belonging to Common Shareholders**
> $$ \text{Common Equity} = \text{Total Equity} - \text{Preferred Claim} = \$1,160,000 - \$258,000 = \mathbf{\$902,000} $$
> **Step 4: Calculate Book Value per Common Share**
> $$ \text{Book Value per Share} = \frac{\$902,000}{45,000\text{ outstanding shares}} = \mathbf{\$20.04 \text{ per share}} $$
