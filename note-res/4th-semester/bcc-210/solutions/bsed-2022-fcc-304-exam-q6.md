### (a)

#### Prime Assumptions and Modern Reflection of the Solow Growth Model

The Solow-Swan Growth Model, developed by Robert Solow and Trevor Swan, is a foundational framework in neoclassical economics that explains long-run economic growth through capital accumulation, labor or population growth, and increases in productivity (technological progress).

##### Prime Assumptions of the Solow Growth Model

- **Constant Returns to Scale (CRS):** The aggregate production function exhibits constant returns to scale. If both capital ($K$) and labor ($L$) are doubled, total output ($Y$) will exactly double:

  $\lambda Y = F(\lambda K, \lambda L)$
- **Diminishing Marginal Productivity:** While holding one input constant, the marginal product of the other input declines as its quantity increases. Thus, $\frac{\partial Y}{\partial K} > 0$ and $\frac{\partial^2 Y}{\partial K^2} < 0$.
- **Substitution Between Inputs:** Capital and labor are smoothly substitutable in the production process, typically modeled using a Cobb-Douglas production function:

  $Y = K^\alpha (AL)^{1-\alpha} \quad \text{where } 0 < \alpha < 1$
- **Constant and Exogenous Population Growth:** The labor force grows at a constant, exogenously determined rate ($n$):

  $\frac{\Delta L}{L} = n$
- **Constant and Exogenous Depreciation:** A fixed fraction ($\delta$) of the capital stock wears out or depreciates every period:

  $\Delta K = I - \delta K$
- **Constant and Exogenous Saving Rate:** A fixed proportion ($s$) of total income/output is saved and automatically funneled into investment ($I$), where $0 < s < 1$:

  $S = I = sY$
- **Closed Economy without Government:** There is no international trade, foreign direct investment, or public spending. Consequently, aggregate demand consists entirely of consumption and investment ($Y = C + I$).
- **Full Employment:** Prices and wages are perfectly flexible, ensuring that all available labor and capital are fully utilized at all times.

##### Do these assumptions properly reflect modern economic conditions?

The assumptions of the Solow growth model do **not** perfectly reflect the complex economic conditions of the modern era. While highly valuable as a baseline conceptual tool, it exhibits significant limitations when applied to contemporary knowledge-based economies:

- **Exogenous vs. Endogenous Technology:** Solow treats technological progress ($g$) as an exogenous variable that drops "like manna from heaven." In reality, modern technological advancement is endogenous—driven by targeted R\&D investments, human capital development, policy incentives, and intellectual property rights (as argued by Endogenous Growth Theories).
- **Constant Returns to Scale vs. Network Effects:** The modern digital economy (e.g., software, AI, biotechnology) is characterized by massive fixed costs and near-zero marginal costs, yielding **increasing returns to scale** and network effects rather than constant returns.
- **Constant Saving Rate:** Solow assumes a fixed marginal propensity to save ($s$). In modern macroeconomics, savings behavior fluctuates dynamically based on demographic shifts, financial market sophistication, interest rates, and intertemporal utility choices.
- **Frictions and Structural Unemployment:** The assumption of perpetual full employment and perfectly flexible markets ignores structural mismatch, sticky prices, institutional rigidities, and persistent involuntary unemployment seen in real-world developing and developed nations alike.

### (b)

#### The Solow Growth Process and Core Functions

The growth process in the Solow model depicts how an economy accumulates capital per worker over time and eventually converges to a stable, long-run steady-state equilibrium. To analyze this, all macroeconomic variables are normalized into per-capita (per-worker) terms, where $k = \frac{K}{L}$ and $y = \frac{Y}{L}$.

##### 1. Total Production Function (in Intensive Form)

Given the CRS assumption, the aggregate production function $Y = F(K, L)$ can be divided by $L$:

$\frac{Y}{L} = F\left(\frac{K}{L}, 1\right) \implies y = f(k)$

The intensive production function $f(k)$ shows that output per worker ($y$) depends entirely on capital per worker ($k$). Due to diminishing marginal returns, the curve is upward-sloping but gets progressively flatter as $k$ increases.

##### 2. Savings Function

Since a constant fraction $s$ of output is saved and invested, the per-capita savings function is expressed as:

$i = s \cdot y = s \cdot f(k)$

This function determines the actual amount of new capital generated per worker in the economy during a given period. It mirrors the shape of the production function but sits below it because $0 < s < 1$.

##### 3. Break-Even Investment Function

Break-even investment represents the volume of investment necessary to maintain the capital-labor ratio ($k$) at its current level. It must compensate for two factors:

- Depreciation ($\delta k$) which wears down existing capital.
- Population growth ($n k$) which dilutes capital across a larger pool of workers.

Thus, the break-even investment function is a linear equation:

$\text{Break-Even Investment} = (n + \delta)k$

##### The Growth Process Dynamics

The fundamental differential equation governing the Solow growth model represents the net change in capital per worker over time ($\Delta k$ or $\dot{k}$):

$\Delta k = s \cdot f(k) - (n + \delta)k$

- **Capital Deepening ($\Delta k > 0$):** When actual investment per worker exceeds break-even investment ($s \cdot f(k) > (n + \delta)k$), capital per worker increases. Workers become better equipped, and output per worker ($y$) grows.
- **Capital Dilution ($\Delta k < 0$):** When actual investment is lower than break-even investment ($s \cdot f(k) < (n + \delta)k$), capital per worker shrinks because depreciation and population growth outpace new investments.
- **Steady-State Equilibrium ($\Delta k = 0$):** The economy reaches its long-run steady state ($k^*$) at the exact intersection where actual savings equal break-even investment:

  $s \cdot f(k^*) = (n + \delta)k^*$

  At this point, $k$ and $y$ stop changing, meaning that per-capita economic growth drops to zero, and total output grows at the exact same rate as the population ($n$).

### (c)

#### Steady-State Dynamics Under Parameter Changes

![[4th-semester/bcc-210/solutions/graphs/solow-model.svg]]

#### (c\_i)

##### Effect of an Increase in Population Growth

When the population growth rate increases from $n_1$ to $n_2$ (where $n_2 > n_1$), the following economic shifts occur:

- **Shift in Functions:** The break-even investment line rotates upward and becomes steeper, moving from $(n_1 + \delta)k$ to $(n_2 + \delta)k$. This indicates that a higher level of investment is now required simply to prevent the capital-labor ratio from falling.
- **Adjustment Process:** At the initial steady-state capital stock $k_1^*$, the new break-even investment requirement exceeds the available savings ($s \cdot f(k_1^*) < (n_2 + \delta)k_1^*$). Consequently, capital dilution takes place, causing capital per worker ($k$) to steadily decrease.
- **New Steady State:** Capital per worker stops declining when it reaches a lower steady state, $k_2^*$.
- **Conclusion:** An increase in the population growth rate **reduces** both the long-run steady-state capital per worker ($k^*$) and the steady-state output per worker ($y^*$). It makes the economy poorer on a per-capita basis because capital resources are stretched thin across a rapidly growing workforce.

#### (c\_ii)

##### Positive Change in Technology

Technological progress can be analyzed in two ways within the Solow framework: as a one-time upward shift in the production function, or as continuous growth in labor efficiency ($A$).

##### Case A: One-time Upward Shift in Technology

If a permanent technological breakthrough occurs, it increases the total factor productivity of the economy.

- **Shift in Functions:** The production function shifts upward from $f_1(k)$ to $f_2(k)$, which simultaneously shifts the savings function upward from $s \cdot f_1(k)$ to $s \cdot f_2(k)$.
- **Adjustment Process:** At the old steady state $k_1^*$, the new savings level is greater than the break-even investment requirement ($s \cdot f_2(k_1^*) > (n + \delta)k_1^*$). This accumulation of excess savings triggers a period of capital deepening, forcing $k$ to rise.
- **New Steady State:** The economy converges to a higher steady-state equilibrium, $k_2^*$.
- **Conclusion:** A positive change in technology **increases** the steady-state capital per worker ($k^*$) and substantially increases steady-state output per worker ($y^*$).

##### Case B: Continuous Technological Progress ($g$)

In an augmented Solow model where technology grows at a continuous exogenous rate $g$, variables are calculated per _effective worker_ ($\hat{k} = \frac{K}{AL}$).

- The break-even investment function shifts to $(n + g + \delta)\hat{k}$.
- An increase in the growth rate of technology ($g$) will rotate the break-even line upward, lowering the steady-state capital per effective worker ($\hat{k}^*$).
- However, along this balanced growth path, actual output per worker ($y = \frac{Y}{L}$) is no longer stagnant; it **grows continuously at the rate of technological progress ($g$)** in the long run. Therefore, continuous technological advancement is the only factor capable of generating sustained, permanent rises in living standards over time.
