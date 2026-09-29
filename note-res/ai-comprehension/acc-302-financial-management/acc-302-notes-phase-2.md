# Valuation of Long-Term Securities: Bonds & Stocks

> [!abstract] Curriculum & Syllabus Context
>
> - **Course:** ACC 302 Financial Management
> - **Phase:** Phase 2: Valuation of Long-Term Securities (Bonds & Stocks)
> - **Target Reading:** Smart & Zutter (16e) Chapters 6 & 7; Van Horne (13e) Chapter 4
> - **Syllabus Focus:** Bond indenture and covenants, bond valuation mathematical models (annual and semiannual), YTM, YTC, current yield vs capital gains yield, price risk vs reinvestment rate risk, preferred stock perpetuity valuation, common stock Gordon growth model, nonconstant supernormal growth, and corporate FCF valuation.

---

### LO 2.1: Bond Fundamentals, Contractual Provisions, and Debt Classification
#### 1. Definition and Basic Elements of a Bond
> [!info] Key Definition: Bond
>
> A **bond** is a long-term debt instrument issued by a corporation or government entity indicating that a borrower has received a specified sum of money and promises to repay it in the future under clearly defined contractual terms.

* **Par Value (Face Value / Principal / Maturity Value, $M$):** The stated face value of the bond, typically $1,000 in corporate financial markets. It represents the principal amount borrowed that the issuing firm promises to repay at maturity.
* **Coupon Interest Rate:** The stated annual rate of interest paid on the bond's par value.
* **Coupon Payment ($INT$):** The specified dollar amount of interest paid each period, calculated as:
  $$INT = \text{Coupon Rate} \times \text{Par Value } (M)$$
  *Note:* Most corporate and municipal bonds pay interest semiannually ($\frac{INT}{2}$ every 6 months).
* **Maturity Date ($N$ or $n$):** A specified future date on which the principal/par value of the bond must be repaid in full. Original maturity refers to the total lifespan at issuance (typically 10 to 30 years).
#### 2. Contractual Aspects & Legal Framework
* **Bond Indenture:** A comprehensive legal agreement (deed of trust) between the issuing corporation and the bondholders that spells out all contractual terms, obligations, interest rates, payment schedules, and restrictive covenants.
* **Trustee:** A neutral third party (typically a commercial bank trust department) officially designated to represent the collective interests of bondholders, monitor company compliance with indenture terms, and initiate legal remedies if default occurs.
* **Standard Debt Provisions:** Indenture clauses requiring the firm to adhere to standard business practices, such as maintaining accurate accounting records, submitting audited statements, paying taxes, and maintaining operational assets.
* **Restrictive Covenants:** Contractual constraints placed on the borrower's operating and financial decisions to protect lenders against risk escalation. Common covenants include:
  * Minimum Liquidity Requirements (e.g., maintaining a minimum Current Ratio or Net Working Capital).
  * Debt Limits (e.g., capping the total Debt-to-Assets ratio or prohibiting additional senior debt issuance).
  * Interest Coverage Floors (e.g., maintaining Times-Interest-Earned $TIE \ge 3.0\times$).
  * Dividend Restrictions (e.g., limiting common dividend payouts to a percentage of net income).
#### 3. General Contractual Features
* **Call Provision:** Gives the issuer the contractual right to redeem/repurchase bonds prior to their stated maturity date at a specified **Call Price**.
  * *Call Price & Call Premium:* The call price equals the par value plus a **Call Premium** (often equal to 1 year's coupon interest at issuance).
  * *Deferred Call / Call Protection:* A provision stating that bonds cannot be called until a specified period has elapsed after issuance (typically 5 to 10 years).
  * *Refunding Operation:* An operation where a firm issues new lower-yielding debt to retire outstanding high-coupon callable debt after interest rates drop.
* **Sinking Fund Provision:** A contractual requirement forcing the issuer to systematically retire a specified percentage of the bond issue each year prior to maturity. Issuers meet sinking fund obligations through two methods:
  1. *Lottery Call at Par:* Calling required numbers of bonds for redemption at par value via serial lottery.
  2. *Open Market Repurchase:* Buying required bonds on the secondary open market.
  *Decision Rule:* The firm chooses the lower-cost option. If market interest rates have risen (bond sells at a discount below par), the firm buys in the open market; if interest rates have fallen (bond sells at a premium above par), the firm calls at par.
* **Convertible Feature:** Allows bondholders to exchange their bonds for a fixed number of shares of common stock at a predetermined conversion price.
* **Stock Purchase Warrants:** Long-term options attached to bonds allowing holders to purchase common stock at a specified exercise price over a given period.
* **Putable Bonds:** Allows bondholders to force the issuer to redeem the bond prior to maturity at par if interest rates rise or specified corporate events occur.
* **Income Bonds:** Pays interest only if the issuing firm earns sufficient operating income; missing payments does not cause legal bankruptcy.
* **Indexed / Inflation-Protected Bonds (TIPS):** Coupon interest and principal payments adjust dynamically based on an inflation index like the Consumer Price Index (CPI).
#### 4. Classifications and Types of Corporate Bonds
* **Unsecured Debt:**
  * *Debentures:* Unsecured long-term bonds backed strictly by the general creditworthiness of the firm.
  * *Subordinated Debentures:* Bonds whose legal claims on assets in liquidation are subordinated to senior debt holders.
* **Secured Debt:**
  * *Mortgage Bonds:* Secured by specific real property / fixed assets (e.g., first mortgage bonds).
  * *Collateral Trust Bonds:* Secured by stocks or bonds of other corporations owned by the issuing firm.
  * *Equipment Trust Certificates:* Secured by specific transport/operating assets (e.g., railroad cars, aircraft); title is held by a trustee until fully retired.
* **Credit Quality & Ratings:** Assigned by agencies like Moody's, Standard & Poor's (S&P), and Fitch:
  * *Investment-Grade Bonds:* Rated Aaa/AAA down to Baa/BBB. Lowest default risk; eligible for institutional holdings.
  * *Speculative / Junk Bonds:* Rated Ba/BB down to C/D. High default risk, carrying high yield premiums.

---
### LO 2.2: Bond Valuation Mathematical Models
#### 1. The Fundamental Valuation Principle
> [!quote] Formula & Derivation: Fundamental Valuation
>
> The intrinsic value ($V_0$) of any financial asset equals the present value ($PV$) of its expected future cash flows, discounted at the investor's required rate of return ($r$) commensurate with risk:
> $$V_0 = \sum_{t=1}^{n} \frac{CF_t}{(1 + r)^t}$$

#### 2. General Valuation Model for Fixed-Rate Annual Coupon Bonds
For a standard coupon-bearing bond providing annual coupon payments ($INT$) for $n$ years and returning par value ($M$) at maturity, the intrinsic bond value ($V_B$ or $P_0$) is expressed as:

> [!quote] Formula & Derivation: Annual Bond Valuation
>
> $$V_B = \frac{INT}{(1 + r_d)^1} + \frac{INT}{(1 + r_d)^2} + \dots + \frac{INT}{(1 + r_d)^n} + \frac{M}{(1 + r_d)^n}$$
> Expanded using Present Value Interest Factors for Annuities ($PVIFA$) and Lump Sums ($PVIF$):
> $$V_B = INT \times \left[ \frac{1 - (1 + r_d)^{-n}}{r_d} \right] + M \times (1 + r_d)^{-n}$$
> $$V_B = INT \times (PVIFA_{r_d, n}) + M \times (PVIF_{r_d, n})$$

#### 3. Bond Price Relationships: Par, Discount, and Premium
The relationship between a bond's required market return ($r_d$) and its fixed coupon interest rate dictates whether it trades at par, a discount, or a premium:
1. **Par Bond ($r_d = \text{Coupon Rate}$):** Market value equals par value ($V_B = M = \$1,000$).
2. **Discount Bond ($r_d > \text{Coupon Rate}$):** Market required return exceeds coupon rate; bond sells below par ($V_B < M$) to compensate investors with capital appreciation.
3. **Premium Bond ($r_d < \text{Coupon Rate}$):** Market required return is below coupon rate; bond sells above par ($V_B > M$) because its coupon yield exceeds current market required returns.
#### 4. Valuation Model for Semiannual Coupon Bonds
Because most real-world corporate bonds pay interest every 6 months, the annual parameters must be adjusted:
* Annual Coupon Payment divided by 2: $\frac{INT}{2}$
* Total compounding periods doubled: $2n$
* Periodic discount rate halved: $\frac{r_d}{2}$

> [!quote] Formula & Derivation: Semiannual Bond Valuation
>
> $$V_B = \sum_{t=1}^{2n} \frac{\frac{INT}{2}}{\left(1 + \frac{r_d}{2}\right)^t} + \frac{M}{\left(1 + \frac{r_d}{2}\right)^{2n}}$$
> $$V_B = \left(\frac{INT}{2}\right) \times \left[ \frac{1 - \left(1 + \frac{r_d}{2}\right)^{-2n}}{\frac{r_d}{2}} \right] + M \times \left(1 + \frac{r_d}{2}\right)^{-2n}$$

#### 5. Valuation of Zero-Coupon Bonds
Zero-coupon bonds make no periodic interest payments ($INT = 0$). They are issued at a deep discount below par, offering returns via full capital appreciation at maturity:
$$V_B = \frac{M}{(1 + r_d)^n} = M \times (PVIF_{r_d, n})$$
Under standard semiannual bond market pricing conventions:
$$V_B = \frac{M}{\left(1 + \frac{r_d}{2}\right)^{2n}}$$

---
### LO 2.3: Bond Yields, Behavior Over Time, and Pricing Conventions
#### 1. Yield to Maturity (YTM)
> [!info] Key Definition: Yield to Maturity (YTM)
>
> **Yield to Maturity (YTM)** is the internal rate of return ($IRR$) earned on a bond if purchased at the current market price ($P_0$) and held until maturity, assuming all payments are made as scheduled without default.

$$P_0 = \sum_{t=1}^{n} \frac{INT}{(1 + YTM)^t} + \frac{M}{(1 + YTM)^n}$$
* If $P_0 < M \implies YTM > \text{Coupon Rate}$ (Discount).
* If $P_0 > M \implies YTM < \text{Coupon Rate}$ (Premium).
* *Semiannual Bond Equivalent YTM:* Financial calculators solve for the periodic rate ($\frac{YTM}{2}$). The nominal annual YTM is $2 \times \left(\frac{YTM}{2}\right)$. The Effective Annual Yield ($EAY$) is:
  $$EAY = \left(1 + \frac{YTM}{2}\right)^2 - 1$$
#### 2. Yield to Call (YTC)
For callable bonds trading at a significant premium ($r_d < \text{Coupon Rate}$), early redemption is highly probable. Investors evaluate the **Yield to Call (YTC)** by replacing maturity ($n$) with years to first call ($N_{call}$) and par value ($M$) with Call Price ($M_{call}$):
$$P_0 = \sum_{t=1}^{N_{call}} \frac{INT}{(1 + YTC)^t} + \frac{M_{call}}{(1 + YTC)^{N_{call}}}$$
*Decision Criterion:* Investors expect to earn **YTC** on premium bonds (where call risk is high) and **YTM** on discount or par bonds.
#### 3. Components of Total Return
A bondholder's expected total rate of return is composed of two distinct parts:
$$\text{Total Return (YTM)} = \text{Current Yield (CY)} + \text{Capital Gains Yield (CGY)}$$
* **Current Yield ($CY$):** The annual dollar interest payment divided by current market price:
  $$CY = \frac{INT}{P_0}$$
* **Capital Gains Yield ($CGY$):** The expected percentage price change over the year:
  $$CGY = \frac{P_1 - P_0}{P_0} = YTM - CY$$
  * For Discount Bonds: $CY < YTM$, so $CGY > 0$ (Price appreciates toward par).
  * For Premium Bonds: $CY > YTM$, so $CGY < 0$ (Price depreciates toward par).
#### 4. Time Path of Bond Values
Assuming market required rates ($r_d$) remain constant over time, the price of any non-defaulted bond must converge to its par value ($M = \$1,000$) as it approaches maturity.



![[ai-comprehension/acc-302-financial-management/assets/acc302-bond-price-time-path.svg]]


#### 5. Quoted Prices vs. Invoice Prices (Clean vs. Dirty Price)
* **Clean Price:** The quoted bond price in financial media, excluding accrued interest.
* **Accrued Interest:** The interest earned by the seller from the last coupon payment date to the transaction settlement date:
  $$\text{Accrued Interest} = \left(\frac{\text{Days Since Last Coupon}}{\text{Days in Coupon Period}}\right) \times \left(\frac{INT}{2}\right)$$
* **Dirty Price (Invoice Price):** The actual total cash amount paid by the buyer to the seller:
  $$\text{Dirty Price} = \text{Clean Price} + \text{Accrued Interest}$$

---
### LO 2.4: Bond Risks: Price Risk vs. Reinvestment Rate Risk
> [!warning] Key Exam Pitfall: Price Risk vs. Reinvestment Rate Risk
>
> Do not confuse Price Risk with Reinvestment Risk; they move in opposite directions as maturity changes. Long-term bonds suffer from high price risk, while short-term bonds suffer from high reinvestment risk.

#### 1. Interest Rate Risk (Price Risk)
**Price Risk** is the risk of a decline in a bond's market value caused by an increase in prevailing market interest rates.
* **Maturity Effect:** For a given change in interest rates, longer-maturity bonds experience significantly higher percentage price fluctuations than shorter-maturity bonds.
* **Coupon Effect:** For a given change in interest rates, lower-coupon bonds (and zero-coupon bonds) experience greater percentage price volatility than higher-coupon bonds.
#### 2. Reinvestment Rate Risk
**Reinvestment Rate Risk** is the risk that a decline in interest rates will force investors to reinvest interim cash flows (coupons and principal repayments) at lower rates, resulting in reduced future income.
* Reinvestment rate risk is highest on **short-term bonds** and **high-coupon bonds** because large cash flows must be rolled over frequently.
#### 3. Comparison & Duration Neutralization
* **Price Risk vs. Reinvestment Risk Trade-off:**
  * *Long-Term Bonds:* High Price Risk, Low Reinvestment Risk.
  * *Short-Term Bonds:* Low Price Risk, High Reinvestment Risk.
* **Duration:** The weighted average time required to receive all contractual cash flows from a bond.
* **Immunization Principle:** An investor with a fixed investment horizon can eliminate net interest rate risk by purchasing a bond portfolio whose **Duration matches the Investment Horizon**.

---
### LO 2.5: Characteristics and Valuation of Preferred Stock
#### 1. Differences Between Debt and Equity

| Dimension | Debt Financing | Preferred Stock | Common Stock Equity |
| :--- | :--- | :--- | :--- |
| **Voice in Management** | None (No voting rights) | Typically none | Full voting rights (Board election) |
| **Claims on Income/Assets** | Senior claim; contractual | Senior to common; subordinated to debt | Residual claim |
| **Maturity** | Stated maturity date | Perpetual / No fixed maturity | Perpetual / Indefinite |
| **Tax Treatment** | Interest is tax-deductible expense | Dividends are NOT tax-deductible | Dividends are NOT tax-deductible |

#### 2. Features of Preferred Stock
> [!info] Key Definition: Preferred Stock
>
> Preferred stock is a **hybrid security** combining characteristics of both debt (fixed periodic income) and equity (no maturity, dividend omission does not trigger legal bankruptcy).

* **Par Value & Stated Dividend ($D_p$):** Stated as a percentage of par value or a fixed dollar amount per share.
* **Cumulative Dividend Feature:** Requires all past unpaid preferred dividends (**Arrearages**) to be paid in full before any dividends can be distributed to common stockholders.
* **Call and Conversion Features:** Most preferred issues include call provisions or options to convert into common stock.
#### 3. Mathematical Valuation Models for Preferred Stock
> [!quote] Formula & Derivation: Preferred Stock Valuation
>
> **Perpetual Preferred Stock:**
> Because preferred stock pays a fixed dividend $D_p$ indefinitely without maturity, it is valued as a level perpetuity:
> $$V_p = \frac{D_p}{r_p}$$
> **Expected Return on Preferred Stock:**
> $$r_p = \frac{D_p}{P_0}$$
> **Preferred Stock with Finite Call Date ($n$):**
> $$V_p = \sum_{t=1}^{n} \frac{D_p}{(1 + r_p)^t} + \frac{M_{call}}{(1 + r_p)^n}$$
> $$V_p = D_p \times (PVIFA_{r_p, n}) + M_{call} \times (PVIF_{r_p, n})$$

---
### LO 2.6: Common Stock Valuation & Dividend Discount Models (DDM)
#### 1. Legal Rights and Features of Common Stockholders
* **Residual Claim:** Common stockholders hold the ultimate equity claim on corporate assets and net cash flows after all senior claims (creditors, bondholders, tax authorities, preferred stockholders) are met.
* **Voting Rights:** Shareholders elect the Board of Directors and vote on key structural changes (mergers, charter amendments).
* **Preemptive Right:** Grants existing shareholders the right to purchase new shares in proportion to their current holdings prior to public issuance, protecting them against ownership dilution and value dilution.
#### 2. Stock Price vs. Intrinsic Value
* **Market Price ($P_0$):** The current price at which stock trades in secondary public financial markets.
* **Intrinsic Value ($\hat{P}_0$):** The estimated economic value of a share of stock based on accurate fundamental risk and return data.
  * If $P_0 < \hat{P}_0 \implies \text{Stock is Undervalued (Buy Signal)}$.
  * If $P_0 > \hat{P}_0 \implies \text{Stock is Overvalued (Sell Signal)}$.
  * In **Market Equilibrium**, $P_0 = \hat{P}_0$.
#### 3. General Dividend Discount Model (DDM)
The intrinsic value of a share of common stock equals the present value of all its expected future cash dividend distributions in perpetuity:
$$\hat{P}_0 = \frac{D_1}{(1 + r_s)^1} + \frac{D_2}{(1 + r_s)^2} + \dots + \frac{D_\infty}{(1 + r_s)^\infty} = \sum_{t=1}^{\infty} \frac{D_t}{(1 + r_s)^t}$$
Where $D_t$ = expected dividend at year $t$, $r_s$ (or $k_e$) = required rate of return on common stock equity.
#### 4. Zero-Growth Dividend Model
For mature companies expected to maintain a constant, non-growing dividend ($g = 0$):
$$\hat{P}_0 = \frac{D}{r_s}$$
#### 5. Constant-Growth (Gordon) Dividend Model
When dividends are expected to grow perpetually at a constant growth rate $g$ (where $r_s > g$):

> [!quote] Formula & Derivation: Gordon Growth Model
>
> $$\hat{P}_0 = \frac{D_0(1 + g)^1}{(1 + r_s)^1} + \frac{D_0(1 + g)^2}{(1 + r_s)^2} + \dots = \frac{D_0(1 + g)}{r_s - g} = \frac{D_1}{r_s - g}$$
> **Expected Rate of Return Equation:**
> $$r_s = \frac{D_1}{P_0} + g$$
> $$\text{Required Return } (r_s) = \text{Expected Dividend Yield } \left(\frac{D_1}{P_0}\right) + \text{Expected Capital Gains Yield } (g)$$
> **Derivation of Sustainable Growth Rate ($g$):**
> $$g = \text{ROE} \times \text{Retention Rate } (b) = \text{ROE} \times (1 - \text{Payout Ratio})$$

#### 6. Variable / Nonconstant Growth Valuation Model
Many firms experience a life cycle starting with supernormal/nonconstant growth ($g_s$) before slowing down to steady long-run constant growth ($g_n$) at the **Horizon/Terminal Date ($N$)**.

**Three-Step Valuation Procedure:**
1. **Calculate Expected Dividends** during the supernormal growth period ($t = 1 \dots N$) and discount them to present value at rate $r_s$:
   $$PV(\text{Dividends}) = \sum_{t=1}^{N} \frac{D_0(1 + g_s)^t}{(1 + r_s)^t}$$
2. **Calculate Horizon Value ($\hat{P}_N$)** at terminal date $N$ using the Gordon Growth Model, and discount $\hat{P}_N$ back to present value:
   $$\hat{P}_N = \frac{D_{N+1}}{r_s - g_n} = \frac{D_N(1 + g_n)}{r_s - g_n}$$
   $$PV(\text{Horizon Value}) = \frac{\hat{P}_N}{(1 + r_s)^N}$$
3. **Sum Present Values** to find intrinsic stock value today ($\hat{P}_0$):
   $$\hat{P}_0 = \sum_{t=1}^{N} \frac{D_t}{(1 + r_s)^t} + \frac{\hat{P}_N}{(1 + r_s)^N}$$

---
### LO 2.7: Corporate Valuation Model (FCF Approach) & Relative Multiples
#### 1. Corporate Valuation / Free Cash Flow (FCF) Model
For firms that pay no dividends, young high-growth firms, or unlisted business divisions, valuation is based on expected **Free Cash Flows (FCF)** discounted at the **Weighted Average Cost of Capital (WACC)**:

> [!quote] Formula & Derivation: Free Cash Flow (FCF)
>
> $$FCF = \text{EBIT}(1 - T) + \text{Depreciation \& Amortization} - \text{Capital Expenditures} - \Delta\text{Net Operating Working Capital}$$

**Valuation Steps:**
1. **Value of Operations ($V_{\text{operations}}$):** Present value of explicit forecasted cash flows plus PV of Horizon Value ($HV_N$):
   $$V_{\text{operations}} = \sum_{t=1}^{N} \frac{FCF_t}{(1 + WACC)^t} + \frac{HV_N}{(1 + WACC)^N}$$
   $$\text{Where } HV_N = \frac{FCF_{N+1}}{WACC - g_{FCF}}$$
2. **Total Corporate Value ($V_{\text{total}}$):**
   $$V_{\text{total}} = V_{\text{operations}} + V_{\text{Non-operating Assets (Excess Cash/Marketable Securities)}}$$
3. **Value of Common Equity ($V_{\text{equity}}$):** Subtract market values of debt ($V_{\text{debt}}$) and preferred stock ($V_{\text{preferred}}$):
   $$V_{\text{equity}} = V_{\text{total}} - V_{\text{debt}} - V_{\text{preferred}}$$
4. **Intrinsic Value Per Share:**
   $$\text{Price Per Share} = \frac{V_{\text{equity}}}{\text{Shares Outstanding}}$$
#### 2. Relative Valuation Multiples & Alternative Approaches
* **Price/Earnings ($P/E$) Multiple Approach:**
  $$\text{Estimated Stock Price } P_0 = \text{Expected EPS}_1 \times \text{Industry Benchmark } P/E \text{ Ratio}$$
* **Enterprise Value Multiple ($EV / EBITDA$) Approach:**
  $$\text{Enterprise Value } (EV) = \text{Market Value of Equity} + \text{Market Value of Debt} + \text{Market Value of Preferred} - \text{Cash}$$
  $$EV = \text{Forecasted EBITDA} \times (\text{Industry Average } EV/EBITDA \text{ Multiple})$$
  $$\text{Market Value of Equity} = EV - \text{Debt MV} - \text{Preferred MV} + \text{Cash}$$
* **Economic Value Added (EVA) Approach:**
  $$\text{Market Value of Equity} = \text{Book Value of Equity} + PV(\text{All Future EVAs})$$
  $$\text{Where } EVA = \text{NOPAT} - (\text{Total Invested Capital} \times WACC)$$
* **Book Value vs. Liquidation Value Per Share:**
  * *Book Value Per Share:* $\frac{\text{Common Equity}}{\text{Shares Outstanding}}$ (conservative accounting baseline).
  * *Liquidation Value Per Share:* $\frac{\text{Net Liquidated Asset Sales Proceeds} - \text{Liabilities} - \text{Preferred}}{\text{Shares Outstanding}}$.