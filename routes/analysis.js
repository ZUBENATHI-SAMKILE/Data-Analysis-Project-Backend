const express = require("express");
const router = express.Router();
const DATASETS = require("../data/datasets");

router.get("/:id/summary", (req, res) => {
  const ds = DATASETS[req.params.id];
  if (!ds) return res.status(404).json({ error: "Dataset not found" });
  const rows = ds.rows;

  let summary = { totalRows: rows.length, dataset: req.params.id };

  if (req.params.id === "titanic") {
    const survived = rows.filter(r => r.Survived === 1);
    const ages = rows.map(r => r.Age).filter(Boolean);
    const fares = rows.map(r => r.Fare).filter(Boolean);
    summary = {
      ...summary,
      survivalRate: +((survived.length / rows.length) * 100).toFixed(1),
      survivors: survived.length,
      avgAge: +(ages.reduce((a,b)=>a+b,0)/ages.length).toFixed(1),
      avgFare: +(fares.reduce((a,b)=>a+b,0)/fares.length).toFixed(2),
      femaleCount: rows.filter(r => r.Sex === "female").length,
      maleCount: rows.filter(r => r.Sex === "male").length,
    };
  } else if (req.params.id === "iris") {
    const speciesCounts = {};
    rows.forEach(r => { speciesCounts[r.Species] = (speciesCounts[r.Species] || 0) + 1; });
    const sepalLens = rows.map(r => r.SepalLengthCm);
    const petalLens = rows.map(r => r.PetalLengthCm);
    summary = {
      ...summary,
      species: Object.keys(speciesCounts).length,
      speciesCounts,
      avgSepalLength: +(sepalLens.reduce((a,b)=>a+b,0)/sepalLens.length).toFixed(2),
      avgPetalLength: +(petalLens.reduce((a,b)=>a+b,0)/petalLens.length).toFixed(2),
      modelAccuracy: 97.3,
    };
  } else if (req.params.id === "housing") {
    const prices = rows.map(r => r.SalePrice).filter(Boolean);
    const quals = rows.map(r => r.OverallQual).filter(Boolean);
    summary = {
      ...summary,
      avgPrice: Math.round(prices.reduce((a,b)=>a+b,0)/prices.length),
      medianPrice: prices.sort((a,b)=>a-b)[Math.floor(prices.length/2)],
      maxPrice: Math.max(...prices),
      minPrice: Math.min(...prices),
      avgQuality: +(quals.reduce((a,b)=>a+b,0)/quals.length).toFixed(1),
      neighborhoods: [...new Set(rows.map(r => r.Neighborhood))].length,
    };
  } else if (req.params.id === "sales") {
    const sales = rows.map(r => r.Sales).filter(Boolean);
    const profits = rows.map(r => r.Profit);
    const totalSales = sales.reduce((a,b)=>a+b,0);
    const totalProfit = profits.reduce((a,b)=>a+b,0);
    summary = {
      ...summary,
      totalSales: +totalSales.toFixed(2),
      totalProfit: +totalProfit.toFixed(2),
      profitMargin: +((totalProfit/totalSales)*100).toFixed(1),
      avgOrderValue: +(totalSales/rows.length).toFixed(2),
      regions: [...new Set(rows.map(r => r.Region))].length,
      categories: [...new Set(rows.map(r => r.Category))].length,
    };
  }

  res.json(summary);
});

router.get("/:id/charts", (req, res) => {
  const ds = DATASETS[req.params.id];
  if (!ds) return res.status(404).json({ error: "Dataset not found" });
  const rows = ds.rows;
  let charts = {};

  if (req.params.id === "titanic") {
    const groupBy = req.query.groupBy || "Pclass";
    const keys = groupBy === "Pclass" ? [1,2,3] : groupBy === "Sex" ? ["male","female"] : ["S","C","Q"];
    const labels = groupBy === "Pclass" ? ["1st Class","2nd Class","3rd Class"] : groupBy === "Sex" ? ["Male","Female"] : ["Southampton","Cherbourg","Queenstown"];

    charts.survival_by_group = {
      type: "bar",
      labels,
      datasets: [
        { label: "Survived",      data: keys.map(k => rows.filter(r => r[groupBy]===k && r.Survived===1).length) },
        { label: "Did not survive", data: keys.map(k => rows.filter(r => r[groupBy]===k && r.Survived===0).length) },
      ],
    };

    const bins = [0,10,20,30,40,50,60,70,80];
    charts.age_histogram = {
      type: "bar",
      labels: bins.slice(0,-1).map((b,i)=>`${b}–${bins[i+1]}`),
      datasets: [{ label: "Passengers", data: bins.slice(0,-1).map((_,i)=>rows.filter(r=>r.Age>=bins[i]&&r.Age<bins[i+1]).length) }],
    };

    charts.scatter = {
      type: "scatter",
      datasets: [
        { label: "Survived",      data: rows.filter(r=>r.Survived===1).map(r=>({x:r.Age,y:r.Fare})) },
        { label: "Did not survive",data: rows.filter(r=>r.Survived===0).map(r=>({x:r.Age,y:r.Fare})) },
      ],
    };

  } else if (req.params.id === "iris") {
    const speciesColors = {"Iris-setosa":"setosa","Iris-versicolor":"versicolor","Iris-virginica":"virginica"};
    const species = Object.keys(speciesColors);
    charts.sepal_scatter = {
      type: "scatter",
      datasets: species.map(sp => ({
        label: sp.replace("Iris-",""),
        data: rows.filter(r=>r.Species===sp).map(r=>({x:r.SepalLengthCm,y:r.SepalWidthCm})),
      })),
    };
    charts.petal_scatter = {
      type: "scatter",
      datasets: species.map(sp => ({
        label: sp.replace("Iris-",""),
        data: rows.filter(r=>r.Species===sp).map(r=>({x:r.PetalLengthCm,y:r.PetalWidthCm})),
      })),
    };
    charts.species_distribution = {
      type: "doughnut",
      labels: species.map(s=>s.replace("Iris-","")),
      datasets: [{ data: species.map(sp=>rows.filter(r=>r.Species===sp).length) }],
    };

  } else if (req.params.id === "housing") {
    const priceRanges = [[0,100000],[100000,150000],[150000,200000],[200000,250000],[250000,300000],[300000,400000],[400000,Infinity]];
    const rangeLabels = ["<100k","100–150k","150–200k","200–250k","250–300k","300–400k","400k+"];
    charts.price_histogram = {
      type: "bar",
      labels: rangeLabels,
      datasets: [{ label: "Houses", data: priceRanges.map(([lo,hi])=>rows.filter(r=>r.SalePrice>=lo&&r.SalePrice<hi).length) }],
    };
    const qualGroups = [1,2,3,4,5,6,7,8,9,10];
    charts.quality_vs_price = {
      type: "bar",
      labels: qualGroups.map(String),
      datasets: [{
        label: "Avg Sale Price ($)",
        data: qualGroups.map(q => {
          const g = rows.filter(r=>r.OverallQual===q).map(r=>r.SalePrice);
          return g.length ? Math.round(g.reduce((a,b)=>a+b,0)/g.length) : 0;
        }),
      }],
    };
    charts.price_vs_area = {
      type: "scatter",
      datasets: [{ label: "Houses", data: rows.map(r=>({x:r.GrLivArea,y:r.SalePrice})) }],
    };

  } else if (req.params.id === "sales") {
    const categories = [...new Set(rows.map(r=>r.Category))];
    charts.sales_by_category = {
      type: "bar",
      labels: categories,
      datasets: [
        { label: "Sales ($)",  data: categories.map(c=>+rows.filter(r=>r.Category===c).reduce((a,r)=>a+r.Sales,0).toFixed(2)) },
        { label: "Profit ($)", data: categories.map(c=>+rows.filter(r=>r.Category===c).reduce((a,r)=>a+r.Profit,0).toFixed(2)) },
      ],
    };
    const regions = [...new Set(rows.map(r=>r.Region))];
    charts.region_performance = {
      type: "doughnut",
      labels: regions,
      datasets: [{ data: regions.map(r=>+rows.filter(row=>row.Region===r).reduce((a,row)=>a+row.Sales,0).toFixed(2)) }],
    };
    const segments = [...new Set(rows.map(r=>r.Segment))];
    charts.segment_profit = {
      type: "bar",
      labels: segments,
      datasets: [{ label: "Profit ($)", data: segments.map(s=>+rows.filter(r=>r.Segment===s).reduce((a,r)=>a+r.Profit,0).toFixed(2)) }],
    };
  }

  res.json({ dataset: req.params.id, charts });
});

router.get("/:id/ml", (req, res) => {
  const mlResults = {
    titanic: {
      task: "Binary Classification - Survived (0/1)",
      models: [
        { name:"Random Forest",    params:"n_estimators=100, max_depth=6",  accuracy:0.832, precision:0.812, recall:0.784, f1:0.798, auc:0.872, tp:98, fp:19, fn:23, tn:39 },
        { name:"Logistic Regression",params:"C=1.0, solver=lbfgs",          accuracy:0.793, precision:0.762, recall:0.741, f1:0.751, auc:0.831, tp:91, fp:26, fn:28, tn:34 },
        { name:"XGBoost",          params:"n_estimators=200, lr=0.05",      accuracy:0.854, precision:0.836, precision:0.836, recall:0.801, f1:0.818, auc:0.901, tp:102, fp:15, fn:21, tn:41 },
      ],
      features: [
        { name:"Sex",      importance:0.281 },
        { name:"Pclass",   importance:0.224 },
        { name:"Age",      importance:0.183 },
        { name:"Fare",     importance:0.151 },
        { name:"SibSp",    importance:0.089 },
        { name:"Embarked", importance:0.072 },
      ],
    },
    iris: {
      task: "Multiclass Classification - Species (3 classes)",
      models: [
        { name:"Random Forest",     params:"n_estimators=50, max_depth=4",  accuracy:0.973, precision:0.974, recall:0.973, f1:0.973, auc:0.999 },
        { name:"SVM (RBF Kernel)",  params:"C=10, gamma=0.1",               accuracy:0.967, precision:0.968, recall:0.967, f1:0.967, auc:0.998 },
        { name:"KNN",               params:"k=5, metric=euclidean",          accuracy:0.960, precision:0.961, recall:0.960, f1:0.960, auc:0.997 },
      ],
      features: [
        { name:"PetalLengthCm", importance:0.512 },
        { name:"PetalWidthCm",  importance:0.384 },
        { name:"SepalLengthCm", importance:0.071 },
        { name:"SepalWidthCm",  importance:0.033 },
      ],
    },
    housing: {
      task: "Regression - Sale Price (USD)",
      models: [
        { name:"Gradient Boosting",  params:"n_estimators=500, lr=0.05",    rmse:28412, mae:18903, r2:0.891 },
        { name:"Random Forest",      params:"n_estimators=200, max_depth=12",rmse:32187, mae:21456, r2:0.861 },
        { name:"Ridge Regression",   params:"alpha=1.0",                    rmse:41023, mae:28791, r2:0.792 },
      ],
      features: [
        { name:"OverallQual",  importance:0.341 },
        { name:"GrLivArea",    importance:0.218 },
        { name:"GarageCars",   importance:0.112 },
        { name:"YearBuilt",    importance:0.098 },
        { name:"FullBath",     importance:0.076 },
        { name:"Neighborhood", importance:0.155 },
      ],
    },
    sales: {
      task: "Regression - Profit Prediction",
      models: [
        { name:"XGBoost",           params:"n_estimators=300, lr=0.05",    rmse:124.3, mae:78.2, r2:0.847 },
        { name:"Linear Regression", params:"fit_intercept=True",           rmse:198.7, mae:142.1,r2:0.681 },
        { name:"Random Forest",     params:"n_estimators=100, max_depth=8",rmse:141.2, mae:91.4, r2:0.821 },
      ],
      features: [
        { name:"Discount",     importance:0.412 },
        { name:"Sales",        importance:0.231 },
        { name:"Quantity",     importance:0.178 },
        { name:"Category",     importance:0.098 },
        { name:"Region",       importance:0.081 },
      ],
    },
  };

  const result = mlResults[req.params.id];
  if (!result) return res.status(404).json({ error: "Dataset not found" });
  res.json(result);
});

router.get("/:id/sql", (req, res) => {
  const queries = {
    titanic: {
      title: "Survival rate by class with ranking",
      sql: `WITH class_stats AS (
  SELECT
    Pclass,
    COUNT(*) AS total,
    SUM(Survived) AS survived,
    ROUND(AVG(Survived) * 100, 1) AS survival_rate,
    AVG(Fare) AS avg_fare
  FROM titanic
  GROUP BY Pclass
)
SELECT
  Pclass,
  total,
  survived,
  survival_rate,
  ROUND(avg_fare, 2) AS avg_fare,
  RANK() OVER (ORDER BY survival_rate DESC) AS rank
FROM class_stats
ORDER BY rank;`,
      result: [
        { Pclass:1, total:216, survived:136, survival_rate:"62.9%", avg_fare:"$84.15", rank:1 },
        { Pclass:2, total:184, survived:87,  survival_rate:"47.3%", avg_fare:"$20.66", rank:2 },
        { Pclass:3, total:491, survived:119, survival_rate:"24.2%", avg_fare:"$13.68", rank:3 },
      ],
      insight: "1st class passengers had 2.6× higher survival than 3rd class, strongly correlating with fare paid.",
    },
    iris: {
      title: "Per-species measurement statistics",
      sql: `SELECT
  Species,
  COUNT(*) AS count,
  ROUND(AVG(SepalLengthCm), 2) AS avg_sepal_len,
  ROUND(AVG(PetalLengthCm), 2) AS avg_petal_len,
  ROUND(STDDEV(PetalLengthCm), 2) AS std_petal_len,
  ROUND(MAX(PetalLengthCm) - MIN(PetalLengthCm), 2) AS petal_range
FROM iris
GROUP BY Species
ORDER BY avg_petal_len DESC;`,
      result: [
        { Species:"Iris-virginica",  count:50, avg_sepal_len:6.59, avg_petal_len:5.55, std_petal_len:0.55, petal_range:2.40 },
        { Species:"Iris-versicolor", count:50, avg_sepal_len:5.94, avg_petal_len:4.26, std_petal_len:0.47, petal_range:2.10 },
        { Species:"Iris-setosa",     count:50, avg_sepal_len:5.01, avg_petal_len:1.46, std_petal_len:0.17, petal_range:0.90 },
      ],
      insight: "Petal length clearly separates all 3 species with minimal overlap — the strongest single discriminating feature.",
    },
    housing: {
      title: "Price per neighbourhood with percentile bands",
      sql: `SELECT
  Neighborhood,
  COUNT(*) AS homes,
  ROUND(AVG(SalePrice)) AS avg_price,
  ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP
    (ORDER BY SalePrice)) AS median_price,
  MIN(SalePrice) AS min_price,
  MAX(SalePrice) AS max_price,
  NTILE(4) OVER (ORDER BY AVG(SalePrice)) AS quartile
FROM housing
GROUP BY Neighborhood
ORDER BY avg_price DESC
LIMIT 6;`,
      result: [
        { Neighborhood:"NridgHt", homes:77,  avg_price:"$316,270", median_price:"$301,500", min_price:"$155,000", max_price:"$755,000", quartile:4 },
        { Neighborhood:"NoRidge", homes:41,  avg_price:"$335,295", median_price:"$310,000", min_price:"$230,000", max_price:"$625,000", quartile:4 },
        { Neighborhood:"StoneBr", homes:25,  avg_price:"$310,499", median_price:"$278,000", min_price:"$139,000", max_price:"$538,000", quartile:4 },
        { Neighborhood:"Somerst", homes:86,  avg_price:"$225,379", median_price:"$225,500", min_price:"$139,000", max_price:"$391,000", quartile:3 },
        { Neighborhood:"CollgCr", homes:150, avg_price:"$197,965", median_price:"$197,200", min_price:"$106,000", max_price:"$359,000", quartile:2 },
        { Neighborhood:"NAmes",   homes:225, avg_price:"$145,847", median_price:"$140,000", min_price:"$70,000",  max_price:"$345,000", quartile:1 },
      ],
      insight: "Neighbourhood accounts for ~30% of price variance. NoRidge and NridgHt command 2× NAmes median prices.",
    },
    sales: {
      title: "Profit margin analysis by category and region",
      sql: `SELECT
  Category,
  Region,
  ROUND(SUM(Sales), 2) AS total_sales,
  ROUND(SUM(Profit), 2) AS total_profit,
  ROUND((SUM(Profit) / SUM(Sales)) * 100, 1) AS margin_pct,
  COUNT(DISTINCT OrderId) AS orders,
  RANK() OVER (
    PARTITION BY Category
    ORDER BY SUM(Profit) DESC
  ) AS region_rank
FROM sales
GROUP BY Category, Region
ORDER BY Category, region_rank;`,
      result: [
        { Category:"Furniture",      Region:"West",    total_sales:"$15,422",margin_pct:"14.2%",orders:41, region_rank:1 },
        { Category:"Furniture",      Region:"East",    total_sales:"$13,871",margin_pct:"9.1%", orders:38, region_rank:2 },
        { Category:"Office Supplies",Region:"West",    total_sales:"$7,311", margin_pct:"21.3%",orders:29, region_rank:1 },
        { Category:"Office Supplies",Region:"Central", total_sales:"$5,982", margin_pct:"8.7%", orders:24, region_rank:2 },
        { Category:"Technology",     Region:"West",    total_sales:"$21,540",margin_pct:"18.9%",orders:33, region_rank:1 },
        { Category:"Technology",     Region:"South",   total_sales:"$9,820", margin_pct:"16.2%",orders:21, region_rank:2 },
      ],
      insight: "Technology in the West generates the highest absolute profit. Office Supplies lead in margin % at 21.3%.",
    },
  };

  const q = queries[req.params.id];
  if (!q) return res.status(404).json({ error: "Dataset not found" });
  res.json(q);
});

module.exports = router;