/**
 * Where to report unpaid / under-minimum wages.
 *
 * Federal: US DOL Wage and Hour Division (WHD).
 *   https://www.dol.gov/agencies/whd/contact/complaints
 * States: agency names and sites from DOL's "State Labor Offices" directory
 *   https://www.dol.gov/agencies/whd/state/contacts   (checked 2026-10-02)
 *
 * Workers can file with WHD (federal law) or their state office (state law —
 * often the better route when the state minimum is higher than $7.25).
 */

export const WHD = {
  name: 'US Dept. of Labor — Wage and Hour Division',
  complaintsUrl: 'https://www.dol.gov/agencies/whd/contact/complaints',
  onlineUrl: 'https://webapps.dol.gov/contactwhd/',
  checklistUrl: 'https://www.dol.gov/agencies/whd/contact/complaints/information',
  phone: '1-866-487-9243',
  phoneUrl: 'tel:18664879243',
};

export const STATE_LABOR_OFFICES: Record<string, { agency: string; url: string }> = {
  AL: { agency: 'Alabama Department of Labor', url: 'https://www.labor.alabama.gov' },
  AK: { agency: 'Alaska Dept. of Labor and Workforce Development', url: 'https://www.labor.state.ak.us' },
  AZ: { agency: 'Industrial Commission of Arizona', url: 'https://www.azica.gov' },
  AR: { agency: 'Arkansas Department of Labor & Licensing', url: 'https://www.labor.arkansas.gov' },
  CA: { agency: 'California Dept. of Industrial Relations', url: 'https://www.dir.ca.gov/contactus.html' },
  CO: { agency: 'Colorado Dept. of Labor and Employment', url: 'https://cdle.colorado.gov/dlss' },
  CT: { agency: 'Connecticut Department of Labor', url: 'https://www.ct.gov/dol' },
  DE: { agency: 'Delaware Department of Labor', url: 'https://www.labor.delaware.gov' },
  DC: { agency: 'DC Department of Employment Services', url: 'https://does.dc.gov' },
  FL: { agency: 'Florida Dept. of Business and Professional Regulation', url: 'https://www.myfloridalicense.com/DBPR/' },
  GA: { agency: 'Georgia Department of Labor', url: 'https://dol.georgia.gov' },
  HI: { agency: 'Hawaii Dept. of Labor & Industrial Relations', url: 'https://labor.hawaii.gov' },
  ID: { agency: 'Idaho Department of Labor', url: 'https://www.labor.idaho.gov' },
  IL: { agency: 'Illinois Department of Labor', url: 'https://labor.illinois.gov' },
  IN: { agency: 'Indiana Department of Labor', url: 'https://www.in.gov/dol' },
  IA: { agency: 'Iowa Dept. of Inspections, Appeals and Licensing', url: 'https://www.iowadivisionoflabor.gov' },
  KS: { agency: 'Kansas Department of Labor', url: 'https://www.dol.ks.gov' },
  KY: { agency: 'Kentucky Education and Labor Cabinet', url: 'https://elc.ky.gov/Pages/index.aspx' },
  LA: { agency: 'Louisiana Workforce Commission', url: 'https://www.laworks.net/' },
  ME: { agency: 'Maine Department of Labor', url: 'https://www.maine.gov/labor' },
  MD: { agency: 'Maryland Department of Labor', url: 'https://www.labor.maryland.gov' },
  MA: { agency: 'Massachusetts Exec. Office of Labor & Workforce Development', url: 'https://www.mass.gov/orgs/executive-office-of-labor-and-workforce-development' },
  MI: { agency: 'Michigan Dept. of Labor and Economic Opportunity', url: 'https://www.michigan.gov/leo' },
  MN: { agency: 'Minnesota Dept. of Labor and Industry', url: 'https://www.dli.mn.gov' },
  MS: { agency: 'Mississippi Dept. of Employment Security', url: 'https://www.mdes.ms.gov' },
  MO: { agency: 'Missouri Dept. of Labor and Industrial Relations', url: 'https://labor.mo.gov' },
  MT: { agency: 'Montana Department of Labor and Industry', url: 'https://dli.mt.gov' },
  NE: { agency: 'Nebraska Department of Labor', url: 'https://dol.nebraska.gov' },
  NV: { agency: 'Nevada Labor Commissioner', url: 'https://labor.nv.gov' },
  NH: { agency: 'New Hampshire Department of Labor', url: 'https://dol.nh.gov' },
  NJ: { agency: 'NJ Dept. of Labor and Workforce Development', url: 'https://www.nj.gov/labor/' },
  NM: { agency: 'New Mexico Dept. of Workforce Solutions', url: 'https://www.dws.state.nm.us/en-us/' },
  NY: { agency: 'New York State Department of Labor', url: 'https://dol.ny.gov' },
  NC: { agency: 'North Carolina Department of Labor', url: 'https://www.labor.nc.gov' },
  ND: { agency: 'North Dakota Dept. of Labor and Human Rights', url: 'https://www.nd.gov/labor' },
  OH: { agency: 'Ohio Department of Commerce', url: 'https://com.ohio.gov' },
  OK: { agency: 'Oklahoma Department of Labor', url: 'https://oklahoma.gov/labor' },
  OR: { agency: 'Oregon Bureau of Labor and Industries (BOLI)', url: 'https://www.oregon.gov/boli' },
  PA: { agency: 'Pennsylvania Dept. of Labor and Industry', url: 'https://www.pa.gov/agencies/dli' },
  RI: { agency: 'Rhode Island Dept. of Labor and Training', url: 'https://dlt.ri.gov' },
  SC: { agency: 'South Carolina Dept. of Labor, Licensing & Regulation', url: 'https://llr.sc.gov/' },
  SD: { agency: 'South Dakota Dept. of Labor and Regulation', url: 'https://dlr.sd.gov' },
  TN: { agency: 'Tennessee Dept. of Labor & Workforce Development', url: 'https://www.tn.gov/workforce' },
  TX: { agency: 'Texas Workforce Commission', url: 'https://www.twc.texas.gov/' },
  UT: { agency: 'Utah Labor Commission', url: 'https://laborcommission.utah.gov' },
  VT: { agency: 'Vermont Department of Labor', url: 'https://labor.vermont.gov' },
  VA: { agency: 'Virginia Dept. of Labor and Industry', url: 'https://www.doli.virginia.gov' },
  WA: { agency: 'Washington Dept. of Labor & Industries', url: 'https://www.lni.wa.gov' },
  WV: { agency: 'West Virginia Division of Labor', url: 'https://labor.wv.gov' },
  WI: { agency: 'Wisconsin Dept. of Workforce Development', url: 'https://dwd.wisconsin.gov' },
  WY: { agency: 'Wyoming Dept. of Workforce Services', url: 'https://dws.wyo.gov' },
};
