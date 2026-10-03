// A second, fictional persona and related postings, independent of the strategy
// candidate. Include a genuinely unsupported tool to guard against invented fit.
const resume = `Morgan Chen
Boston, MA | morgan.chen@example.com | 555-010-3000

PROFESSIONAL SUMMARY
Technology partnerships professional supporting partner programs and sales enablement.

EXPERIENCE
Data Analyst | Cedar Analytics | Boston, MA | Jan 2021 – Present
- Built SQL dashboards in Power BI for 40 retail stores, reducing reporting time by 30%
- Automated Python data validation for 12 regional datasets, reducing errors by 25%
- Developed Excel forecasting models for monthly budgets, improving forecast accuracy by 20%
- Analyzed inventory trends and demand planning data for 15 warehouses
- Presented financial analysis and KPI recommendations to senior leadership
Reporting Analyst | Maple Retail | Boston, MA | Jan 2018 – Dec 2020
- Produced weekly sales reports using SQL and Excel for 20 business units
- Improved data quality checks for customer records, reducing duplicates by 35%

EDUCATION
B.S. in Statistics | State University | May 2017

SKILLS
SQL, Python, Excel, Power BI, Data Analysis, Data Visualization, Forecasting, Financial Analysis, Data Quality`;
const postings = [
  { title: 'Data Analyst', text: 'Build reporting dashboards and improve data quality.\nRequirements\n- 3+ years of experience in data analysis\n- SQL\n- Python\n- Power BI\n- Excel' },
  { title: 'Business Intelligence Analyst', text: 'Deliver dashboards and KPI reporting for retail operations.\nRequirements\n- SQL\n- Power BI\n- Data visualization\n- Data quality' },
  { title: 'Financial Analyst', text: 'Analyze budgets and financial forecasts for regional business units.\nRequirements\n- Excel\n- Financial analysis\n- Forecasting\nPreferred\n- SQL' },
  { title: 'Supply Chain Analyst', text: 'Analyze warehouse inventory and demand planning.\nRequirements\n- Excel\n- SQL\n- Data analysis\nPreferred\n- Python' },
];
const holdouts = [
  { title: 'Senior Reporting Analyst', text: 'Own SQL reporting and Power BI dashboards for customer data.\nRequired qualifications\n- SQL\n- Power BI\n- Data quality\nPreferred qualifications\n- Python' },
  { title: 'Planning Analyst', text: 'Deliver Excel forecasting models and analyze regional budgets.\nRequired qualifications\n- Excel\n- Forecasting\n- Financial analysis' },
];
const unsupported = { title: 'Data Analyst', text: 'Requirements\n- SQL\n- Snowflake\n- dbt' };
module.exports = { resume, postings, holdouts, unsupported };
