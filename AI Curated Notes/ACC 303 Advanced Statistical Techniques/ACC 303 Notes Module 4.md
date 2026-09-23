# Analysis of Variance (ANOVA)

> [!abstract] Curriculum & Syllabus Context
>
> - **Course:** ACC 303 Advanced Statistical Techniques
> - **Module:** Module 4: Analysis of Variance (ANOVA)
> - **Target Reading:** Lind, Marchal & Wathen (18e) Ch. 12; Kothari (2e) Ch. 11
> - **Syllabus Focus:** Fisher F-distribution, familywise Type I error inflation, ANOVA assumptions (normality, homoscedasticity, independence), One-Way ANOVA sum of squares partitioning (TSS = SST + SSE), shortcut raw score methods, Fisher's LSD post-hoc test, Two-Way ANOVA without interaction (Randomized Block Design), Two-Way ANOVA with interaction (Factorial Design), Latin Square Design, and ANOCOVA.

---

### 1. Conceptual Foundations & The Fisher $F$-Distribution

#### 1.1 Definition, Scope, and Purpose of Analysis of Variance
> [!info] Key Definition
>
> **Analysis of Variance (ANOVA)** is an inferential statistical technique developed by Sir Ronald A. Fisher to test the equality of three or more population means simultaneously. While Student's $t$-test or the $Z$-test evaluates differences between two sample means, attempting to compare $k$ population means ($k > 2$) through pairwise $t$-tests leads to severe statistical distortions.

#### 1.2 The Problem of Inflated Type I Error Rate
> [!quote] Formula & Derivation: Familywise Type I Error Rate
>
> If a researcher wishes to compare $k = 4$ independent treatment means ($\mu_1, \mu_2, \mu_3, \mu_4$), the number of required pairwise comparisons is given by the combination formula:
> $$C = \frac{k(k-1)}{2} = \frac{4(3)}{2} = 6 \text{ pairwise } t\text{-tests}$$
> 
> If each individual test is conducted at a nominal significance level of $\alpha = 0.05$ (meaning the probability of no Type I error per test is $1 - \alpha = 0.95$), the overall familywise (or experimentwise) Type I error rate ($\alpha_{\text{family}}$) across the 6 independent tests inflates according to:
> $$\alpha_{\text{family}} = 1 - (1 - \alpha)^C = 1 - (0.95)^6 = 1 - 0.7351 = 0.2649 \text{ (or } 26.49\%\text{)}$$

Thus, conducting multiple pairwise $t$-tests dramatically increases the risk of falsely declaring a statistically significant difference when none exists. ANOVA solves this problem by conducting a single, omni-bus $F$-test that controls the overall Type I error rate at the nominal level $\alpha$.

---

#### 1.3 Assumptions Underlying ANOVA
For the $F$-statistic in ANOVA to be strictly valid, three fundamental mathematical assumptions must be satisfied:
1. **Normality**: The continuous dependent variable $X$ is normally distributed within each of the $k$ populations:
   $$X_{ij} \sim N(\mu_j, \sigma^2) \quad \text{for } j = 1, 2, \dots, k$$
2. **Homogeneity of Variances (Homoscedasticity)**: The $k$ population variances are equal to a common variance $\sigma^2$:
   $$\sigma_1^2 = \sigma_2^2 = \dots = \sigma_k^2 = \sigma^2$$
3. **Independence of Errors**: The observations $X_{ij}$ are drawn independently within and across samples. There must be no serial correlation or systematic clustering among observations.

---

#### 1.4 Mathematical Properties of the Fisher $F$-Distribution
> [!quote] Formula & Derivation: The $F$-Distribution
>
> The $F$-distribution is defined as the ratio of two independent chi-square ($\chi^2$) random variables, each divided by its respective degrees of freedom:
> $$F = \frac{\chi_1^2 / v_1}{\chi_2^2 / v_2} \sim F(v_1, v_2)$$
> where $v_1$ represents the numerator degrees of freedom and $v_2$ represents the denominator degrees of freedom.

Key mathematical properties of the $F$-distribution include:
1. **Non-negativity**: Since $F$ is a ratio of squared quantities (variances), $F \ge 0$. The domain spans $[0, \infty)$.
2. **Positive Skewness**: The distribution is non-symmetric and positively skewed to the right. As $v_1$ and $v_2$ tend to infinity, $F$ approaches a normal distribution.
3. **Family of Curves**: The exact shape of the $F$-pdf depends uniquely on the parameter pair $(v_1, v_2)$.
4. **Mathematical Equivalence to Student's $t$**: For a single numerator degree of freedom ($v_1 = 1$), the square of a $t$-distributed random variable with $v$ degrees of freedom is identically distributed as an $F$-variable with $(1, v)$ degrees of freedom:
   $$t_v^2 = F_{1, v}$$

---

#### 1.5 Testing Equality of Two Population Variances
Before running ANOVA or pooled two-sample $t$-tests, the assumption of equal variances ($\sigma_1^2 = \sigma_2^2$) can be directly evaluated using a two-variance $F$-test:
* **Null Hypothesis**: $H_0: \sigma_1^2 = \sigma_2^2$ (or $\sigma_1^2 / \sigma_2^2 = 1$)
* **Alternative Hypothesis**: $H_1: \sigma_1^2 \ne \sigma_2^2$
* **Test Statistic**:
  $$F = \frac{s_1^2}{s_2^2}$$
  where $s_1^2$ is conventionally designated as the larger sample variance ($s_1^2 > s_2^2$) to place the computed ratio in the upper tail ($F > 1.00$).
* **Degrees of Freedom**: Numerator $v_1 = n_1 - 1$, Denominator $v_2 = n_2 - 1$.
* **Decision Rule**: For a two-tailed significance level $\alpha$, compare $F_{\text{calc}}$ against $F_{\alpha/2, n_1-1, n_2-1}$. Reject $H_0$ if $F_{\text{calc}} > F_{\text{critical}}$.

---

### 2. One-Way Classification ANOVA (Completely Randomized Design)

#### 2.1 The Completely Randomized Design Structure
In a One-Way ANOVA (or Completely Randomized Design - C.R. Design), experimental units or subjects are randomly assigned to $k$ mutually exclusive treatment groups or categories of a single independent factor. 

Let $X_{ij}$ represent the $i$-th observation in the $j$-th treatment group, where $i = 1, 2, \dots, n_j$ and $j = 1, 2, \dots, k$. The total sample size across all treatments is $N = \sum_{j=1}^k n_j$.

The linear statistical model for One-Way ANOVA is expressed as:
$$X_{ij} = \mu + \tau_j + \epsilon_{ij}$$
where:
* $\mu$ is the overall (grand) population mean.
* $\tau_j = \mu_j - \mu$ is the specific effect of treatment $j$, subject to the restriction $\sum_{j=1}^k n_j \tau_j = 0$.
* $\epsilon_{ij} \stackrel{\text{iid}}{\sim} N(0, \sigma^2)$ is the random error term.

The hypotheses tested are:
$$H_0: \mu_1 = \mu_2 = \dots = \mu_k \quad (\text{or } \tau_1 = \tau_2 = \dots = \tau_k = 0)$$
$$H_1: \text{At least two population means differ } (\text{or at least one } \tau_j \ne 0)$$

---

#### 2.2 Mathematical Proof of Sum of Squares Partitioning

```mermaid
graph TD
    A[Total Sum of Squares <br> SS_total] --> B[Treatment Sum of Squares <br> SST <br> Between-Group Variation]
    A --> C[Error Sum of Squares <br> SSE <br> Within-Group Variation]
    
    style A fill:#2a4d69,stroke:#333,stroke-width:2px,color:#fff
    style B fill:#4b86b4,stroke:#333,color:#fff
    style C fill:#4b86b4,stroke:#333,color:#fff
```

The foundational principle of ANOVA is the algebraic decomposition of the total sum of squared deviations ($SS_{\text{total}}$) into two orthogonal, non-overlapping components: Treatment Sum of Squares ($SST$) and Error Sum of Squares ($SSE$).

> [!quote] Formula & Derivation: Proof of SS Partitioning
>
> **Proof**:
> Consider the identity for any individual observation $X_{ij}$ relative to the grand mean $\bar{\bar{X}}$ and its group mean $\bar{X}_j$:
> $$(X_{ij} - \bar{\bar{X}}) = (\bar{X}_j - \bar{\bar{X}}) + (X_{ij} - \bar{X}_j)$$
> Squaring both sides of the identity yields:
> $$(X_{ij} - \bar{\bar{X}})^2 = (\bar{X}_j - \bar{\bar{X}})^2 + (X_{ij} - \bar{X}_j)^2 + 2(\bar{X}_j - \bar{\bar{X}})(X_{ij} - \bar{X}_j)$$
> Summing across all observations $i = 1, \dots, n_j$ and all treatments $j = 1, \dots, k$:
> $$\sum_{j=1}^k \sum_{i=1}^{n_j} (X_{ij} - \bar{\bar{X}})^2 = \sum_{j=1}^k \sum_{i=1}^{n_j} (\bar{X}_j - \bar{\bar{X}})^2 + \sum_{j=1}^k \sum_{i=1}^{n_j} (X_{ij} - \bar{X}_j)^2 + 2 \sum_{j=1}^k (\bar{X}_j - \bar{\bar{X}}) \left[ \sum_{i=1}^{n_j} (X_{ij} - \bar{X}_j) \right]$$
> By definition of the sample mean, $\sum_{i=1}^{n_j} (X_{ij} - \bar{X}_j) = 0$. Consequently, the cross-product term vanishes identically:
> $$2 \sum_{j=1}^k (\bar{X}_j - \bar{\bar{X}})(0) = 0$$
> Simplifying the remaining terms gives the fundamental ANOVA identity:
> $$\sum_{j=1}^k \sum_{i=1}^{n_j} (X_{ij} - \bar{\bar{X}})^2 = \sum_{j=1}^k n_j (\bar{X}_j - \bar{\bar{X}})^2 + \sum_{j=1}^k \sum_{i=1}^{n_j} (X_{ij} - \bar{X}_j)^2$$
> $$SS_{\text{total}} = SST + SSE$$

Where:
1. **Total Sum of Squares ($SS_{\text{total}}$)**: Measures the total variation of all $N$ individual observations around the grand mean $\bar{\bar{X}}$, with $df = N - 1$.
2. **Treatment Sum of Squares ($SST$)**: Measures the variation *between* treatment group means and the grand mean (between-group variation), with $df = k - 1$.
3. **Error Sum of Squares ($SSE$)**: Measures the random variation *within* each treatment group (within-group / residual variation), with $df = N - k$.

---
#### 2.3 Degrees of Freedom, Mean Squares, and the Test Statistic
> [!quote] Formula & Derivation: Mean Squares & Test Statistic
>
> Dividing each sum of squares by its corresponding degrees of freedom yields the variance estimates or Mean Squares ($MS$):
> 1. **Mean Square Treatments ($MST$)**:
>    $$MST = \frac{SST}{k - 1}$$
>    Under $H_0$, $E(MST) = \sigma^2$. Under $H_1$, $E(MST) = \sigma^2 + \frac{\sum n_j \tau_j^2}{k - 1}$.
> 2. **Mean Square Error ($MSE$)**:
>    $$MSE = \frac{SSE}{N - k}$$
>    $MSE$ is an unbiased estimator of the common population variance $\sigma^2$ regardless of whether $H_0$ is true or false: $E(MSE) = \sigma^2$.
> 3. **The Test Statistic ($F$-ratio)**:
>    $$F = \frac{MST}{MSE} = \frac{SST / (k - 1)}{SSE / (N - k)} \sim F(k - 1, N - k)$$

If $H_0$ is true, $MST$ and $MSE$ both estimate $\sigma^2$, yielding $F \approx 1.0$. If $H_0$ is false, treatment differences inflate $MST$, causing $F > 1.0$.

---
#### 2.4 One-Way ANOVA Table Format
The computations are organized into the standard One-Way ANOVA table:

$$ \begin{array}{lccccc}
\hline
\textbf{Source of Variation} & \textbf{Sum of Squares } (SS) & \textbf{df} & \textbf{Mean Square } (MS) & \textbf{F-Ratio} & \textbf{Critical Value } (F_{\alpha}) \\
\hline
\textbf{Between Treatments} & SST = \sum n_j (\bar{X}_j - \bar{\bar{X}})^2 & k - 1 & MST = \frac{SST}{k - 1} & F = \frac{MST}{MSE} & F_{\alpha, k-1, N-k} \\
\textbf{Within Treatments (Error)} & SSE = \sum \sum (X_{ij} - \bar{X}_j)^2 & N - k & MSE = \frac{SSE}{N - k} & - & - \\
\hline
\textbf{Total} & SS_{\text{total}} = \sum \sum (X_{ij} - \bar{\bar{X}})^2 & N - 1 & - & - & - \\
\hline \hline
\end{array} $$

---
#### 2.5 Computational Shortcut & Coding Methods
To avoid rounding errors associated with non-integer sample means, the shortcut computational method uses raw totals:
1. **Total Sample Sum ($T$) & Group Totals ($T_j$)**:
   $$T = \sum_{j=1}^k \sum_{i=1}^{n_j} X_{ij}, \quad T_j = \sum_{i=1}^{n_j} X_{ij}, \quad N = \sum_{j=1}^k n_j$$
2. **Correction Factor ($CF$)**:
   $$CF = \frac{T^2}{N}$$
3. **Sum of Squares Calculations**:
   $$SS_{\text{total}} = \sum_{j=1}^k \sum_{i=1}^{n_j} X_{ij}^2 - CF$$
   $$SST = \sum_{j=1}^k \frac{T_j^2}{n_j} - CF$$
   $$SSE = SS_{\text{total}} - SST$$

**Coding Method (Linear Transformation)**:
When individual observations are large or unwieldy, transform the raw values using $X'_{ij} = \frac{X_{ij} - A}{c}$, where $A$ is an arbitrary constant and $c$ is a scaling factor. The resulting $F$-ratio is invariant to linear coding:
$$F(X') = F(X)$$

---
#### 2.6 Post-ANOVA Pairwise Comparisons: Fisher's Least Significant Difference (LSD)
When the overall $F$-test rejects $H_0$, it confirms that at least two treatment means differ, but does not identify which specific pairs differ. Fisher's LSD procedure evaluates pairwise differences $|\bar{X}_i - \bar{X}_j|$ using a $t$-distribution with $N - k$ degrees of freedom:
1. **Fisher's LSD Statistic**:
   $$\text{LSD} = t_{\alpha/2, N-k} \sqrt{MSE \left( \frac{1}{n_i} + \frac{1}{n_j} \right)}$$
2. **Decision Rule**: Two population means $\mu_i$ and $\mu_j$ are statistically significantly different at level $\alpha$ if:
   $$|\bar{X}_i - \bar{X}_j| > \text{LSD}$$
3. **Confidence Interval for $(\mu_i - \mu_j)$**:
   $$\text{CI}_{1-\alpha} = (\bar{X}_i - \bar{X}_j) \pm t_{\alpha/2, N-k} \sqrt{MSE \left( \frac{1}{n_i} + \frac{1}{n_j} \right)}$$
   If the confidence interval contains $0.0$, the difference between $\mu_i$ and $\mu_j$ is not statistically significant.

---
### 3. Two-Way Classification ANOVA (Without Interaction — Randomized Block Design)
#### 3.1 Concept of Local Control and Blocking Variables
In many empirical investigations, extraneous background variation among experimental units inflates the within-group error term ($SSE$), reducing test sensitivity (power).

To control for extraneous variability, subjects are grouped into homogeneous sets called **blocks** based on a secondary attribute (e.g., driver experience, soil fertility, age bracket). Each block contains $k$ experimental units, randomly assigned to the $k$ treatments. This is known as a **Randomized Block Design (R.B. Design)**.

---
#### 3.2 Partitioning the Sum of Squares in Randomized Block Design

```mermaid
graph TD
    A[Total Sum of Squares <br> SS_total] --> B[Treatment SS <br> SST]
    A --> C[Block SS <br> SSB]
    A --> D[Error SS <br> SSE]
    
    style A fill:#2a4d69,stroke:#333,stroke-width:2px,color:#fff
    style B fill:#4b86b4,stroke:#333,color:#fff
    style C fill:#4b86b4,stroke:#333,color:#fff
    style D fill:#4b86b4,stroke:#333,color:#fff
```

Including a blocking variable introduces a third source of variation: Block Sum of Squares ($SSB$):
$$SS_{\text{total}} = SST + SSB + SSE$$

Where:
* $k$ = number of treatments ($j = 1, \dots, k$).
* $b$ = number of blocks ($i = 1, \dots, b$).
* $N = k \times b$ = total number of observations.
* $T_{.j}$ = sum of observations in treatment $j$.
* $T_{i.}$ = sum of observations in block $i$.

> [!quote] Formula & Derivation: Computational Formulas
>
> 1. **Correction Factor**:
>    $$CF = \frac{T^2}{k \cdot b}$$
> 2. **Total Sum of Squares**:
>    $$SS_{\text{total}} = \sum_{i=1}^b \sum_{j=1}^k X_{ij}^2 - CF$$
> 3. **Treatment Sum of Squares**:
>    $$SST = \frac{\sum_{j=1}^k T_{.j}^2}{b} - CF$$
> 4. **Block Sum of Squares**:
>    $$SSB = \frac{\sum_{i=1}^b T_{i.}^2}{k} - CF$$
> 5. **Error Sum of Squares (By Subtraction)**:
>    $$SSE = SS_{\text{total}} - SST - SSB$$

---
#### 3.3 Two-Way ANOVA Table Setup (Without Interaction)
The degrees of freedom partition as $(N - 1) = (k - 1) + (b - 1) + (k - 1)(b - 1)$:

$$ \begin{array}{lccccc}
\hline
\textbf{Source of Variation} & \textbf{Sum of Squares } (SS) & \textbf{df} & \textbf{Mean Square } (MS) & \textbf{F-Ratio} & \textbf{Critical Value } (F_{\alpha}) \\
\hline
\textbf{Treatments} & SST & k - 1 & MST = \frac{SST}{k - 1} & F_{\text{treat}} = \frac{MST}{MSE} & F_{\alpha, k-1, (k-1)(b-1)} \\
\textbf{Blocks} & SSB & b - 1 & MSB = \frac{SSB}{b - 1} & F_{\text{block}} = \frac{MSB}{MSE} & F_{\alpha, b-1, (k-1)(b-1)} \\
\textbf{Residual (Error)} & SSE & (k - 1)(b - 1) & MSE = \frac{SSE}{(k - 1)(b - 1)} & - & - \\
\hline
\textbf{Total} & SS_{\text{total}} & k \cdot b - 1 & - & - & - \\
\hline \hline
\end{array} $$

By isolating block variability ($SSB$), $SSE$ is substantially reduced relative to a One-Way ANOVA, increasing $F_{\text{treat}}$ and improving statistical power.

---
### 4. Two-Way Classification ANOVA with Interaction (Factorial Design)
#### 4.1 Definition and Concept of Interaction Effects
When two factors (Factor A with $a$ levels and Factor B with $b$ levels) are investigated simultaneously, an **interaction effect** occurs if the impact of one factor on the dependent variable varies depending on the level of the second factor.
* **No Interaction**: The effect of Factor A is identical across all levels of Factor B (cell means plot as parallel lines).
* **Interaction Present**: The effect of Factor A changes across levels of Factor B (cell means plot as non-parallel or intersecting lines).

---
#### 4.2 Factorial Design Structure with Cell Replications
To isolate the interaction sum of squares ($SSI$) from pure experimental error ($SSE$), the experiment must include $m > 1$ independent replications per cell.
* Total observations: $N = a \times b \times m$.
* $X_{ijk}$ represents the $k$-th replication ($k = 1, \dots, m$) in cell $(i, j)$ corresponding to Factor A level $i$ ($i = 1, \dots, a$) and Factor B level $j$ ($j = 1, \dots, b$).

The full structural model is:
$$X_{ijk} = \mu + \alpha_i + \beta_j + (\alpha\beta)_{ij} + \epsilon_{ijk}$$
where $(\alpha\beta)_{ij}$ represents the interaction effect between factor levels $i$ and $j$.

---
#### 4.3 Sum of Squares Decomposition for Two-Way Factorial ANOVA

```mermaid
graph TD
    A[Total Sum of Squares <br> SS_total] --> B[Factor A SS <br> SSA]
    A --> C[Factor B SS <br> SSB]
    A --> D[Interaction SS <br> SSI]
    A --> E[Within-Cell Error SS <br> SSE]
    
    style A fill:#2a4d69,stroke:#333,stroke-width:2px,color:#fff
    style B fill:#4b86b4,stroke:#333,color:#fff
    style C fill:#4b86b4,stroke:#333,color:#fff
    style D fill:#84b6f4,stroke:#333,color:#000
    style E fill:#84b6f4,stroke:#333,color:#000
```

The total variation partitions into four components:
$$SS_{\text{total}} = SSA + SSB + SSI + SSE$$

1. **Factor A Sum of Squares**:
   $$SSA = \frac{\sum_{i=1}^a T_{i..}^2}{b \cdot m} - CF \quad (df = a - 1)$$
2. **Factor B Sum of Squares**:
   $$SSB = \frac{\sum_{j=1}^b T_{.j.}^2}{a \cdot m} - CF \quad (df = b - 1)$$
3. **Subcell Sum of Squares ($SS_{\text{cells}}$)**:
   $$SS_{\text{cells}} = \frac{\sum_{i=1}^a \sum_{j=1}^b T_{ij.}^2}{m} - CF \quad (df = ab - 1)$$
4. **Interaction Sum of Squares ($SSI$)**:
   $$SSI = SS_{\text{cells}} - SSA - SSB \quad (df = (a - 1)(b - 1))$$
5. **Within-Cell Error Sum of Squares ($SSE$)**:
   $$SSE = \sum_{i=1}^a \sum_{j=1}^b \sum_{k=1}^m (X_{ijk} - \bar{X}_{ij.})^2 = SS_{\text{total}} - SS_{\text{cells}} \quad (df = ab(m - 1))$$

---

#### 4.4 Complete Factorial ANOVA Table & Testing Sequence

$$ \begin{array}{lccccc}
\hline
\textbf{Source of Variation} & \textbf{Sum of Squares } (SS) & \textbf{df} & \textbf{Mean Square } (MS) & \textbf{F-Ratio} & \textbf{Critical Region } (F_{\alpha}) \\
\hline
\textbf{Factor A} & SSA & a - 1 & MSA = \frac{SSA}{a - 1} & F_A = \frac{MSA}{MSE} & F_{\alpha, a-1, ab(m-1)} \\
\textbf{Factor B} & SSB & b - 1 & MSB = \frac{SSB}{b - 1} & F_B = \frac{MSB}{MSE} & F_{\alpha, b-1, ab(m-1)} \\
\textbf{Interaction } (AB) & SSI & (a - 1)(b - 1) & MSI = \frac{SSI}{(a - 1)(b - 1)} & F_{AB} = \frac{MSI}{MSE} & F_{\alpha, (a-1)(b-1), ab(m-1)} \\
\textbf{Error (Within-Cell)} & SSE & ab(m - 1) & MSE = \frac{SSE}{ab(m - 1)} & - & - \\
\hline
\textbf{Total} & SS_{\text{total}} & abm - 1 & - & - & - \\
\hline \hline
\end{array} $$

**Testing Sequence**:
1. **Test Interaction First**: Evaluate $F_{AB} = \frac{MSI}{MSE}$. If $F_{AB}$ is statistically significant, main effects cannot be interpreted independently because factor impacts are conditional.
2. **Test Main Effects**: If interaction is not significant ($F_{AB} < F_{\text{crit}}$), evaluate main factor effects $F_A$ and $F_B$ independently.

---

### 5. Advanced ANOVA Extensions & Analysis of Covariance (ANOCOVA)

#### 5.1 Latin Square Design (L.S. Design)
The Latin Square Design controls for two independent extraneous blocking factors (e.g., soil fertility gradient across rows, seed variety across columns) simultaneously without requiring a full factorial setup.

In an $k \times k$ Latin Square, $k$ treatments are assigned such that each treatment appears **exactly once in each row and once in each column**.
Total sum of squares partitions into four orthogonal components:
$$SS_{\text{total}} = SS_{\text{rows}} + SS_{\text{cols}} + SST + SSE$$
Degrees of freedom:
$$df_{\text{total}} = k^2 - 1, \quad df_{\text{rows}} = k - 1, \quad df_{\text{cols}} = k - 1, \quad df_{\text{treat}} = k - 1, \quad df_{\text{error}} = (k - 1)(k - 2)$$

---

#### 5.2 Analysis of Covariance (ANOCOVA)
Analysis of Covariance (ANOCOVA) combines linear regression analysis with ANOVA to remove the confounding influence of one or more continuous, uncontrolled extraneous variables (covariates $Z$) from the dependent variable $X$.

**ANOCOVA Mechanics**:
1. **Linear Adjustment**: The effect of covariate $Z$ on dependent variable $X$ is adjusted using the pooled within-group slope $b$:
   $$b = \frac{E_{XZ}}{E_{ZZ}}$$
   where $E_{XZ}$ is the within-group sum of cross-products and $E_{ZZ}$ is the within-group sum of squares for covariate $Z$.
2. **Adjusted Error Sum of Squares ($SSE_{\text{adj}}$)**:
   $$SSE_{\text{adj}} = E_{XX} - \frac{(E_{XZ})^2}{E_{ZZ}} \quad (df = N - k - 1)$$
3. **Adjusted Total Sum of Squares ($SS_{\text{total, adj}}$)**:
   $$SS_{\text{total, adj}} = T_{XX} - \frac{(T_{XZ})^2}{T_{ZZ}} \quad (df = N - 2)$$
4. **Adjusted Treatment Sum of Squares ($SST_{\text{adj}}$)**:
   $$SST_{\text{adj}} = SS_{\text{total, adj}} - SSE_{\text{adj}} \quad (df = k - 1)$$
5. **Adjusted Treatment Means**:
   $$\bar{X}_{j, \text{adj}} = \bar{X}_j - b(\bar{Z}_j - \bar{\bar{Z}})$$
   where $\bar{Z}_j$ is the covariate mean for group $j$ and $\bar{\bar{Z}}$ is the overall covariate mean.

---

### 6. Step-by-Step Numerical Problem Walkthroughs

> [!example] Numerical Problem 1: One-Way ANOVA with Shortcut Method & Fisher's LSD
>
> **Scenario**: A corporate research department evaluates three different training programs (A, B, C) for sales executives. Twelve sales recruits are randomly assigned to the three programs (4 per group). The test scores out of 100 are:
> * **Program A**: 75, 80, 70, 83
> * **Program B**: 85, 88, 90, 81
> * **Program C**: 65, 70, 60, 67
> 
> Perform a One-Way ANOVA at $\alpha = 0.05$. If $H_0$ is rejected, apply Fisher's LSD test to identify significant pairwise differences.
> 
> **Solution Step-by-Step**:
> 1. **Totals and Sample Sizes**:
>    * $n_A = 4, n_B = 4, n_C = 4 \implies N = 12, k = 3$
>    * $T_A = 75 + 80 + 70 + 83 = 308$
>    * $T_B = 85 + 88 + 90 + 81 = 344$
>    * $T_C = 65 + 70 + 60 + 67 = 262$
>    * Grand Total $T = 308 + 344 + 262 = 914$
> 
> 2. **Sum of Squares Calculations**:
>    * **Correction Factor**:
>      $$CF = \frac{T^2}{N} = \frac{(914)^2}{12} = \frac{835396}{12} = 69616.333$$
>    * **Raw Sum of Squares ($\sum \sum X_{ij}^2$)**:
>      $$\sum X_A^2 = 75^2 + 80^2 + 70^2 + 83^2 = 5625 + 6400 + 4900 + 6889 = 23814$$
>      $$\sum X_B^2 = 85^2 + 88^2 + 90^2 + 81^2 = 7225 + 7744 + 8100 + 6561 = 29630$$
>      $$\sum X_C^2 = 65^2 + 70^2 + 60^2 + 67^2 = 4225 + 4900 + 3600 + 4489 = 17214$$
>      $$\sum \sum X_{ij}^2 = 23814 + 29630 + 17214 = 70658$$
>    * **Total Sum of Squares ($SS_{\text{total}}$)**:
>      $$SS_{\text{total}} = 70658 - 69616.333 = 1041.667$$
>    * **Treatment Sum of Squares ($SST$)**:
>      $$SST = \left( \frac{308^2}{4} + \frac{344^2}{4} + \frac{262^2}{4} \right) - CF$$
>      $$SST = \left( \frac{94864}{4} + \frac{118336}{4} + \frac{68644}{4} \right) - 69616.333 = (23716 + 29584 + 17161) - 69616.333 = 70461 - 69616.333 = 844.667$$
>    * **Error Sum of Squares ($SSE$)**:
>      $$SSE = SS_{\text{total}} - SST = 1041.667 - 844.667 = 197.000$$
> 
> 3. **Mean Squares & $F$-Statistic**:
>    * $df_{\text{treat}} = k - 1 = 3 - 1 = 2$
>    * $df_{\text{error}} = N - k = 12 - 3 = 9$
>    * $MST = \frac{844.667}{2} = 422.333$
>    * $MSE = \frac{197.000}{9} = 21.889$
>    * $F = \frac{MST}{MSE} = \frac{422.333}{21.889} = 19.294$
> 
> 4. **ANOVA Table Setup**:
> 
> | Source of Variation | Sum of Squares ($SS$) | Degrees of Freedom ($df$) | Mean Square ($MS$) | $F$-Ratio | Critical Value ($F_{0.05, 2, 9}$) |
> | :--- | :--- | :--- | :--- | :--- | :--- |
> | **Treatments** | $844.667$ | $2$ | $422.333$ | $19.294$ | $4.256$ |
> | **Error** | $197.000$ | $9$ | $21.889$ | — | — |
> | **Total** | $1041.667$ | $11$ | — | — | — |
> 
> 5. **Decision**:
>    Since $F_{\text{calc}} = 19.294 > F_{0.05, 2, 9} = 4.256$, reject $H_0$ at $\alpha = 0.05$. Conclude that training programs yield significantly different mean test scores.
> 
> 6. **Fisher's LSD Post-Hoc Test**:
>    * Treatment Means: $\bar{X}_A = \frac{308}{4} = 77.0$, $\bar{X}_B = \frac{344}{4} = 86.0$, $\bar{X}_C = \frac{262}{4} = 65.5$
>    * Critical $t_{0.025, 9} = 2.262$
>    * $\text{LSD} = t_{\alpha/2, N-k} \sqrt{MSE \left( \frac{1}{n_i} + \frac{1}{n_j} \right)} = 2.262 \sqrt{21.889 \left( \frac{1}{4} + \frac{1}{4} \right)} = 2.262 \sqrt{10.9445} = 2.262 \times 3.308 = 7.483$
>    * **Pairwise Comparisons**:
>      1. $|\bar{X}_B - \bar{X}_A| = |86.0 - 77.0| = 9.0 > 7.483 \implies \text{Significant difference (Program B > Program A)}$
>      2. $|\bar{X}_A - \bar{X}_C| = |77.0 - 65.5| = 11.5 > 7.483 \implies \text{Significant difference (Program A > Program C)}$
>      3. $|\bar{X}_B - \bar{X}_C| = |86.0 - 65.5| = 20.5 > 7.483 \implies \text{Significant difference (Program B > Program C)}$

---

> [!example] Numerical Problem 2: Two-Way ANOVA Without Interaction (Randomized Block Design)
>
> **Scenario**: A logistics manager evaluates 3 route algorithms ($k = 3$) across 4 different delivery drivers ($b = 4$, acting as blocks). Travel times (minutes) are recorded as follows:
> 
> | Driver (Block) | Route 1 | Route 2 | Route 3 | Block Total ($T_{i.}$) |
> | :--- | :--- | :--- | :--- | :--- |
> | **Driver 1** | 22 | 18 | 26 | **66** |
> | **Driver 2** | 20 | 16 | 24 | **60** |
> | **Driver 3** | 25 | 21 | 29 | **75** |
> | **Driver 4** | 17 | 13 | 21 | **51** |
> | **Route Total ($T_{.j}$)** | **84** | **68** | **100** | **Grand Total $T = 252$** |
> 
> Test at $\alpha = 0.05$ whether:
> 1. Mean travel times differ across routes ($H_0: \mu_1 = \mu_2 = \mu_3$).
> 2. Mean travel times differ across driver blocks ($H_0: \mu_{D1} = \mu_{D2} = \mu_{D3} = \mu_{D4}$).
> 
> **Solution Step-by-Step**:
> 1. **Constants**:
>    $k = 3, b = 4 \implies N = 12$
> 2. **Correction Factor ($CF$)**:
>    $$CF = \frac{(252)^2}{12} = \frac{63504}{12} = 5292.000$$
> 3. **Total Sum of Squares ($SS_{\text{total}}$)**:
>    $$\sum \sum X_{ij}^2 = 22^2 + 18^2 + 26^2 + 20^2 + 16^2 + 24^2 + 25^2 + 21^2 + 29^2 + 17^2 + 13^2 + 21^2$$
>    $$\sum \sum X_{ij}^2 = 484 + 324 + 676 + 400 + 256 + 576 + 625 + 441 + 841 + 289 + 169 + 441 = 5522.000$$
>    $$SS_{\text{total}} = 5522.000 - 5292.000 = 230.000$$
> 4. **Treatment Sum of Squares ($SST$)**:
>    $$SST = \frac{84^2 + 68^2 + 100^2}{4} - CF = \frac{7056 + 4624 + 10000}{4} - 5292 = \frac{21680}{4} - 5292 = 5420.000 - 5292.000 = 128.000$$
> 5. **Block Sum of Squares ($SSB$)**:
>    $$SSB = \frac{66^2 + 60^2 + 75^2 + 51^2}{3} - CF = \frac{4356 + 3600 + 5625 + 2601}{3} - 5292 = \frac{16182}{3} - 5292 = 5394.000 - 5292.000 = 102.000$$
> 6. **Error Sum of Squares ($SSE$)**:
>    $$SSE = SS_{\text{total}} - SST - SSB = 230.000 - 128.000 - 102.000 = 0.000 \implies \text{(Exact fit without error noise)}$$
>    *(Note: To demonstrate realistic F-testing, let residual noise be adjusted slightly for real-world illustration; here $SSE = 0$ indicates perfect additive linearity).*

---

> [!example] Numerical Problem 3: Two-Way ANOVA With Interaction
>
> **Scenario**: An industrial plant investigates the impact of Machine Brand (Factor A: 2 levels - Brand A1, Brand A2) and Operator Experience (Factor B: 2 levels - B1 Junior, B2 Senior) on daily output. $m = 3$ replications per cell are collected ($N = 2 \times 2 \times 3 = 12$):
> 
> * **Cell (A1, B1)**: 40, 42, 38 $\implies T_{11.} = 120$
> * **Cell (A1, B2)**: 50, 52, 48 $\implies T_{12.} = 150$
> * **Cell (A2, B1)**: 30, 32, 28 $\implies T_{21.} = 90$
> * **Cell (A2, B2)**: 60, 62, 58 $\implies T_{22.} = 180$
> 
> Test main and interaction effects at $\alpha = 0.05$.
> 
> **Solution Step-by-Step**:
> 1. **Totals**:
>    * $T_{A1..} = 120 + 150 = 270$
>    * $T_{A2..} = 90 + 180 = 270$
>    * $T_{.B1.} = 120 + 90 = 210$
>    * $T_{.B2.} = 150 + 180 = 330$
>    * Grand Total $T = 540, N = 12$
> 2. **Correction Factor**:
>    $$CF = \frac{540^2}{12} = \frac{291600}{12} = 24300.000$$
> 3. **Total Sum of Squares**:
>    $$\sum \sum \sum X_{ijk}^2 = (40^2+42^2+38^2) + (50^2+52^2+48^2) + (30^2+32^2+28^2) + (60^2+62^2+58^2)$$
>    $$\sum \sum \sum X_{ijk}^2 = (1600+1764+1444) + (2500+2704+2304) + (900+1024+784) + (3600+3844+3364) = 4808 + 7508 + 2708 + 10808 = 25832.000$$
>    $$SS_{\text{total}} = 25832 - 24300 = 1532.000$$
> 4. **Factor A Sum of Squares**:
>    $$SSA = \frac{270^2 + 270^2}{6} - 24300 = \frac{72900 + 72900}{6} - 24300 = 24300 - 24300 = 0.000$$
> 5. **Factor B Sum of Squares**:
>    $$SSB = \frac{210^2 + 330^2}{6} - 24300 = \frac{44100 + 108900}{6} - 24300 = \frac{153000}{6} - 24300 = 25500 - 24300 = 1200.000$$
> 6. **Subcell Sum of Squares ($SS_{\text{cells}}$)**:
>    $$SS_{\text{cells}} = \frac{120^2 + 150^2 + 90^2 + 180^2}{3} - 24300 = \frac{14400 + 22500 + 8100 + 32400}{3} - 24300 = \frac{77400}{3} - 24300 = 25800 - 24300 = 1500.000$$
> 7. **Interaction Sum of Squares ($SSI$)**:
>    $$SSI = SS_{\text{cells}} - SSA - SSB = 1500 - 0 - 1200 = 300.000$$
> 8. **Error Sum of Squares ($SSE$)**:
>    $$SSE = SS_{\text{total}} - SS_{\text{cells}} = 1532 - 1500 = 32.000$$
> 
> 9. **Degrees of Freedom & Mean Squares**:
>    * $df_A = 2 - 1 = 1 \implies MSA = 0 / 1 = 0$
>    * $df_B = 2 - 1 = 1 \implies MSB = 1200 / 1 = 1200$
>    * $df_I = (2-1)(2-1) = 1 \implies MSI = 300 / 1 = 300$
>    * $df_E = 2 \times 2 \times (3 - 1) = 8 \implies MSE = 32 / 8 = 4$
> 
> 10. **$F$-Ratios & ANOVA Table**:
> 
> | Source of Variation | Sum of Squares ($SS$) | Degrees of Freedom ($df$) | Mean Square ($MS$) | $F$-Ratio | Critical Value ($F_{0.05, 1, 8}$) | Decision |
> | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
> | **Factor A (Machine)** | $0.000$ | $1$ | $0.000$ | $0.000$ | $5.318$ | Not Significant |
> | **Factor B (Experience)**| $1200.000$ | $1$ | $1200.000$ | $300.000$ | $5.318$ | **Significant** |
> | **Interaction ($AB$)** | $300.000$ | $1$ | $300.000$ | $75.000$ | $5.318$ | **Significant** |
> | **Error (Within-Cell)**| $32.000$ | $8$ | $4.000$ | — | — | — |
> | **Total** | $1532.000$ | $11$ | — | — | — | — |
> 
> **Interpretation**:
> Both Operator Experience ($F = 300.0, p < 0.001$) and Machine-Experience Interaction ($F = 75.0, p < 0.001$) are highly statistically significant. Senior operators produce significantly higher output, and the effect of machine brand depends heavily on operator experience (Brand A2 yields maximum output with senior operators, but Brand A1 is superior for junior operators).
