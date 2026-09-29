### (a)

#### Distinction Between Economic Growth and Economic Development and the Measurement of the Human Development Index (HDI)

##### Distinction Between Economic Growth and Economic Development

Economic growth and economic development are two core concepts in economics that are often used interchangeably, but they represent fundamentally distinct phenomena.

|**Feature**|**Economic Growth**|**Economic Development**|
|---|---|---|
|**Definition**|A narrow, quantitative increase in a country's real national output or per capita income over a specific period.|A broad, multi-dimensional process involving quantitative growth alongside qualitative changes in socio-economic structures.|
|**Nature of Change**|Quantitative change (increase in GDP, GNP, or per capita income).|Both quantitative and qualitative changes (structural shifts, reduction in poverty, inequality, and unemployment).|
|**Scope**|Uni-dimensional and narrow; focuses purely on the expansion of economic output.|Multi-dimensional and comprehensive; encompasses living standards, institutional changes, and human well-being.|
|**Measurement**|Measured using macroeconomic indicators like Real GDP growth rate and Per Capita Income.|Measured using complex composite indices like the Human Development Index (HDI), Gender Inequality Index (GII), and Poverty Indices.|
|**Prerequisites**|Can occur without economic development (e.g., a resource-rich nation experiencing a temporary boom in oil exports without structural progress).|Cannot occur sustainably without economic growth. Growth acts as a necessary but not sufficient condition for development.|
|**Focus**|Primarily focuses on production, market efficiency, and output maximization.|Focuses on distribution, equity, capabilities, freedom, and the overall quality of human life.|

##### Measurement of the Human Development Index (HDI)

The Human Development Index (HDI) is a composite statistical index created by the United Nations Development Programme (UNDP) to measure a country's average achievements in three basic dimensions of human development.

###### 1. Dimensions and Indicators of HDI

The index evaluates progress across three fundamental dimensions, each measured by specific indicators:

- **Long and Healthy Life (Health):** Measured by **Life Expectancy at Birth**. This indicator reflects the capability of a population to live a long and healthy life under prevailing health conditions.
- **Knowledge (Education):** Measured by a combination of two distinct indicators:
  - _Mean Years of Schooling:_ The average number of years of education received by people aged 25 and older during their lifetime.
  - _Expected Years of Schooling:_ The total number of years of schooling that a child of school-entrance age can expect to receive if prevailing patterns of age-specific enrollment rates persist throughout their life.
- **A Decent Standard of Living (Income):** Measured by **Gross National Income (GNI) per capita** adjusted for purchasing power parity (PPP) in US dollars. A logarithmic transformation is applied to income because incremental increases in income have a diminishing marginal utility on human capabilities.

###### 2. Step-by-Step Calculation Methodology

To transform these raw indicators into a single composite index between 0 and 1, the following formal mathematical process is implemented:

**Step I: Calculation of Dimension Indices**

For each dimension, individual indices are computed using a normalization formula based on fixed global minimum and maximum values:

$\text{Dimension Index} = \frac{\text{Actual Value} - \text{Minimum Value}}{\text{Maximum Value} - \text{Minimum Value}}$

- _Health Index ($I_{\text{Health}}$):_ Computed using the normalized value of life expectancy.
- _Education Index ($I_{\text{Education}}$):_ The geometric mean of the _Mean Years of Schooling Index_ and the _Expected Years of Schooling Index_, normalized together.
- _Income Index ($I_{\text{Income}}$):_ Calculated using natural logarithms ($\ln$) to account for the diminishing returns of wealth:

$I_{\text{Income}} = \frac{\ln(\text{Actual GNI per capita}) - \ln(\text{Minimum GNI per capita})}{\ln(\text{Maximum GNI per capita}) - \ln(\text{Minimum GNI per capita})}$

**Step II: Aggregating into the Final HDI**

Once the three individual dimension indices are derived, the final HDI score is computed by calculating their **Geometric Mean**. This ensures that poor performance in any single dimension cannot be easily substituted or masked by exceptional performance in another:

$\text{HDI} = \sqrt[3]{I_{\text{Health}} \times I_{\text{Education}} \times I_{\text{Income}}}$

The resulting HDI value ranges strictly between $0$ and $1$, where values closer to $1$ indicate a higher level of human development. Countries are classified accordingly into four tiers: Low, Medium, High, or Very High Human Development.

### (b)

#### The Kuznets Hypothesis and Causes of Increasing Equality with Economic Development

##### The Kuznets Hypothesis of Economic Growth and Income Distribution

Formulated by economist Simon Kuznets in 1955, the **Kuznets Hypothesis** posits a distinct structural relationship between the level of economic development (measured by per capita income) and the degree of income inequality within a society. This relationship is graphically characterized as an **Inverted-U shaped curve**.

According to Kuznets, as a nation progresses from a low-income agrarian economy to a modern industrial economy, income distribution goes through two distinct historical phases:

###### 1. The Early Stage: Rising Inequality

In the initial phases of economic growth, income inequality tends to widen significantly. This occurs due to structural transformations:

- **Rural-to-Urban Migration:** Labor shifts from low-productivity, low-wage agricultural sectors to higher-productivity, higher-wage modern urban industrial sectors. Initially, only a small fraction of the workforce benefits from these urban wages, increasing the gap between urban industrial capitalists/skilled workers and rural laborers.
- **Concentration of Capital:** Early industrial savings and capital accumulation are heavily concentrated in the hands of a small elite class of entrepreneurs who reinvest their profits, further inflating their income relative to the rest of the population.

###### 2. The Turning Point and Later Stage: Falling Inequality

Once a country reaches a certain critical threshold of per capita income (the peak of the inverted-U), further economic growth begins to systematically reduce inequality, leading to an **increase in income equality**. The distribution of wealth becomes progressively more balanced as the economy matures into an advanced state.

##### Causes of the Increase in Equality with Development

The transition down the right-hand slope of the Kuznets curve—where economic growth actively drives an increase in equality—is propelled by several systemic structural, market, and institutional forces:

- **Expansion of Human Capital and Education:** As an economy develops, the state and individuals invest heavily in education and vocational training. The supply of skilled labor expands, reducing the structural skill premium (the wage gap between highly skilled and unskilled workers) and elevating the earning capacity of the lower-income segments of the population.
- **Labor Market Integration and Rising Wages:** Eventually, the surplus pool of rural agricultural labor is fully absorbed by the modern industrial and service sectors. As the economy reaches this "Lewisian turning point," labor becomes scarce, driving up real wages for low-skilled and manual laborers, which compresses the wage distribution gap.
- **Government Intervention and Progressive Fiscal Policies:** Mature economies possess broader, more institutionalized tax bases. Governments can efficiently levy progressive income taxes on corporate wealth and high-income earners. These revenues are subsequently redistributed to lower-income households through robust public services, free healthcare, subsidized education, and targeted social safety nets.
- **Demographic Transformations:** Economic development typically coincides with the demographic transition model, characterized by falling birth rates, particularly among low-income households. Smaller family sizes reduce the dependency ratio within low-income brackets, raising per capita household income and enhancing intergenerational economic mobility.
- **Institutional Development and Labor Organization:** Advanced development fosters strong legal framework conditions, labor unions, and collective bargaining rights. The implementation of enforced minimum wage laws, workplace protections, and employee welfare policies prevents capital owners from disproportionately exploiting labor, thereby shifting the functional distribution of income in favor of workers.
