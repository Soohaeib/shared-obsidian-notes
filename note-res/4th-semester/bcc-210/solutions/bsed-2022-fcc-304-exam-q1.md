### (a)

#### Distinguish between Economic Growth and Economic Development

Economic growth and economic development are two fundamental concepts in development economics. While they are often used interchangeably in everyday language, they represent distinct phenomena with different scopes, implications, and measurement criteria.

|**Feature**|**Economic Growth**|**Economic Development**|
|---|---|---|
|**Definition**|The quantitative increase in a country's real national output or gross domestic product (GDP) over a specified period.|A multi-dimensional process involving quantitative growth alongside qualitative changes in economic, social, and institutional structures.|
|**Scope**|**Narrow concept:** Focuses purely on macroeconomic indicators like GDP, GNP, and per capita income.|**Broad concept:** Encompasses economic growth, structural changes, poverty reduction, inequality mitigation, and improvements in the quality of life.|
|**Nature of Change**|Quantitative in nature (more output, higher income).|Both quantitative and qualitative in nature (better institutional frameworks, enhanced welfare, structural shifts).|
|**Structural Shift**|Does not necessarily imply structural changes in the economy.|Mandates a structural shift, typically from an agrarian economy to industrialized and service-oriented sectors.|
|**Indicators**|Real GDP, Gross National Product (GNI), Per Capita Income.|Human Development Index (HDI), Gini Coefficient, literacy rates, life expectancy, infant mortality rates.|
|**Prerequisites**|Can occur without economic development (e.g., resource-rich nations experiencing growth purely via commodity exports).|Economic growth is a necessary but insufficient condition for economic development.|
|**Focus**|Primarily concerned with production capacity and output optimization.|Concerned with the distribution of resources, standard of living, human capability enhancement, and well-being.|
|**Time Horizon**|Short-term or long-term operational focus.|Essentially a long-term, continuous, and sustainable process.|

##### Measurement of the Human Development Index (HDI)

The Human Development Index (HDI) is a composite statistic developed by the United Nations Development Programme (UNDP) to measure and rank countries' socio-economic development levels. It shifts the focus of development from purely economic metrics to human-centric outcomes.

The HDI is calculated as the geometric mean of three normalized dimension indices representing health, education, and standard of living.

##### 1. Three Core Dimensions and Indicators

- **Long and Healthy Life (Health Index):** Measured by **Life Expectancy at Birth**. It assesses the longevity and health status of the population.
- **Knowledge and Education (Education Index):** Measured via two distinct indicators:
  - _Mean Years of Schooling:_ The average number of years of education received by people aged 25 and older during their lifetime.
  - _Expected Years of Schooling:_ The total number of years of schooling a child of school-entrance age can expect to receive if prevailing patterns of age-specific enrollment rates persist throughout their life.
- **Decent Standard of Living (Income Index):** Measured by **Gross National Income (GNI) per capita** adjusted for purchasing power parity (PPP) in US dollars. This accounts for local price differences and cost of living.

##### 2. Standard Goalposts for Normalization

Before calculating the final HDI, each component indicator is transformed into a value between $0$ and $1$ using fixed minimum and maximum values (goalposts):

| **Dimension Indicator**             | **Observed Minimum** | **Observed Maximum** |
| ----------------------------------- | -------------------- | -------------------- |
| Life Expectancy at Birth (years)    | $20.0$               | $85.0$               |
| Expected Years of Schooling (years) | $0.0$                | $18.0$               |
| Mean Years of Schooling (years)     | $0.0$                | $15.0$               |
| GNI per capita (PPP $)              | $\$100.00$           | $\$75,000.00$        |

##### 3. Step-by-Step Mathematical Calculation

###### Step 1: Dimension Indices Calculation

For health and education indicators, the following general normalization formula is applied:

$\text{Dimension Index} = \frac{\text{Actual Value} - \text{Minimum Value}}{\text{Maximum Value} - \text{Minimum Value}}$

- **Health Index ($I_{\text{Health}}$):**

  $I_{\text{Health}} = \frac{\text{Actual Life Expectancy} - 20}{85 - 20}$
- **Education Index ($I_{\text{Education}}$):** First, calculate the individual index for both schooling indicators using the standard formula. The Education Index is the arithmetic mean of these two individual indices:

  $I_{\text{Mean Schooling}} = \frac{\text{Actual Mean Years} - 0}{15 - 0}$

  $I_{\text{Expected Schooling}} = \frac{\text{Actual Expected Years} - 0}{18 - 0}$

  $I_{\text{Education}} = \frac{I_{\text{Mean Schooling}} + I_{\text{Expected Schooling}}}{2}$
- **Income Index ($I_{\text{Income}}$):** Because income has a diminishing marginal utility as it increases, the HDI uses log values of GNI per capita to normalize the standard of living:

  $I_{\text{Income}} = \frac{\ln(\text{Actual GNI per capita}) - \ln(100)}{\ln(75,000) - \ln(100)}$

###### Step 2: Combining the Indices

The final Human Development Index (HDI) is computed by taking the **geometric mean** of the three independent dimension indices:

$\text{HDI} = \sqrt[3]{I_{\text{Health}} \times I_{\text{Education}} \times I_{\text{Income}}}$

The resulting score ranges between $0$ and $1$, where values closer to $1$ indicate a higher level of human development.

### (b)

#### The Kuznets Hypothesis of Economic Growth and Income Distribution

The Kuznets Hypothesis, proposed by economist Simon Kuznets in 1955, postulates an empirical relationship between economic growth and income inequality. According to this hypothesis, as a country goes through economic development, income inequality initially rises, reaches a peak, and subsequently declines.

##### 1. The Inverted-U Shaped Curve

When mapped graphically with income inequality (typically measured by the Gini Coefficient) on the Y-axis and economic development (measured by Per Capita Income) on the X-axis, the relationship traces out an **Inverted-U shaped curve** known as the **Kuznets Curve**.

- **Phase 1 (Early Stage):** As a low-income agrarian economy begins to industrialize, capital investment concentrates in urban areas. Rural surplus labor migrates to cities, but wages remain low due to the high labor supply. Concurrently, the owners of capital accumulate significant wealth, causing income inequality to rise sharply.
- **Phase 2 (Turning Point):** The economy reaches a critical threshold of industrialization where surplus rural labor is fully absorbed, and the labor market tightens.
- **Phase 3 (Mature Stage):** As the economy continues to expand, structural improvements, democratic institutions, social safety nets, and widespread access to education stabilize urban wages. The benefits of growth trickle down, and income inequality steadily drops, resulting in an increase in economic equality.

#### Causes of Changes in Income Distribution with Economic Development

The shifts along the Kuznets Curve—from rising inequality to increasing equality—are driven by structural, technological, institutional, and demographic transitions within the economy.

##### 1. Causes for the Initial Rise in Income Inequality

In the early stages of development, several forces work against an equitable distribution of income:

- **Structural Sectoral Shifts:** The core mechanism is the transition of labor from the traditional agricultural sector (characterized by low average income but low variance) to the modern industrial sector (characterized by higher average income and high variance). This migration naturally widens the nationwide inequality gap.
- **Concentration of Capital Accumulation:** Early industrialization requires massive capital formulation. Since savings are concentrated within high-income groups, entrepreneurs and investors retain a large share of the national output as profits, which they reinvest, further expanding the wealth gap between capital owners and wage laborers.
- **The Skill Premium:** Initial technological adoption creates a structural mismatch in the labor market. The demand for skilled workers, managers, and technicians spikes sharply, commanding a substantial wage premium, while the wages of uneducated or low-skilled manual laborers remain suppressed.

##### 2. Causes for the Subsequent Increase in Equality (Reduction of Inequality)

As the economy achieves advanced development, counter-balancing factors emerge that drive income distribution back toward relative equality:

- **Universalization of Education and Skills:** With increased national income, governments invest heavily in human capital. As access to quality education and technical vocational training expands across all strata of society, the relative supply of skilled labor increases. This effectively compresses the skill premium and levels out worker compensation.
- **Institutional Frameworks and Labor Reforms:** A developed economy fosters stable democratic processes and stronger institutions. The growth of organized labor unions increases the collective bargaining power of employees. Concurrently, state interventions such as statutory minimum wage laws protect lower-income groups from exploitation.
- **Progressive Taxation and Fiscal Redistribution:** Mature economies possess sophisticated tax administration frameworks capable of implementing progressive income taxation. Revenues generated from high-income earners are systematically redirected into public expenditure projects, such as subsidized healthcare, public transit, social safety nets, and targeted cash transfers for vulnerable demographics.
- **Demographic Stabilization:** As development progresses, lower-income households undergo a demographic transition towards lower fertility rates. A reduced dependency ratio within low-income families increases the per capita household income, which effectively narrows the socio-economic welfare gap.
