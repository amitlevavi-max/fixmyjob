import { findMatches, issuerOk, nameKey, keywordFor } from './match.ts';

type Case = [string, string, string, string, string | null, boolean]; // ourName, ourIssuer, cosName, cosOrg, cosAcronym, shouldMatch
const cases: Case[] = [
  // should match
  ['Certified Welder (CW)', 'American Welding Society', 'Certified Welder', 'American Welding Society', null, true],
  ['Phlebotomy Technician - PBT(ASCP)', 'American Society for Clinical Pathology', 'Phlebotomy Technician', 'American Society for Clinical Pathology', 'PBT(ASCP)', true],
  ['Microsoft Certified: Power Platform Fundamentals', 'Certiport', 'Microsoft Power Platform Fundamentals', 'Microsoft Corporation', 'PL-900', true],
  ['Associate Safety Professional® (ASP®)', 'Board of Certified Safety Professionals (BCSP)', 'Associate Safety Professional', 'Board of Certified Safety Professionals', 'ASP', true],
  ['Certified Clinical Medical Assistant (CCMA)', 'National Healthcareer Association (NHA)', 'Certified Clinical Medical Assistant', 'National Healthcareer Association', 'CCMA', true],
  ['Systems Security Certified Practitioner (SSCP)', '(ISC)²', 'Systems Security Certified Practitioner', 'International Information Systems Security Certification Consortium, Inc.', 'SSCP', true],
  ['Medical-Surgical Nursing', 'American Nurses Association (ANA)', 'Medical-Surgical Nursing', 'ANA Enterprise', 'MEDSURG-BC', true],
  ['Registered Vascular Technologist', 'American Registry of Diagnostic Medical Sonography', 'Registered Vascular Technologist (RVT)', 'American Registry for Diagnostic Medical Sonography', 'RVT', true],
  ['AWS Certified Cloud Practitioner', 'Amazon Web Services', 'AWS Certified Cloud Practitioner', 'Amazon.com Web Services', null, true],
  // should NOT match
  ['Professional Scrum Master level II', 'Scrum.org', 'Professional Scrum Master level I', 'Scrum.org', 'PSM', false],
  ['Critical Care Registered Nurse (Pediatric)', 'American Association of Critical Care Nurses (AACN)', 'Critical Care Registered Nurse (Adult)', 'American Association of Critical-Care Nurses', 'CCRN', false],
  ['Certified Information Privacy Professional - Europe', 'International Association of Privacy Professionals', 'Certified Information Privacy Professional', 'International Association of Privacy Professionals', 'CIPP/G', false],
  ['Registered Technologist - Sonography', 'American Registry of Radiologic Technologists', 'Registered Technologist - Mammography', 'American Registry of Radiologic Technologists', 'RTM', false],
  ['CCIE Data Center', 'Cisco', 'CCIE Enterprise Infrastructure Certification', 'Cisco Systems, Inc.', 'CCIE', false],
  ['Information Systems Security Engineering Professional (CISSP-ISSEP)', '(ISC)²', 'Certified Information Systems Security Professional', 'International Information Systems Security Certification Consortium, Inc.', 'CISSP', false],
  ['LEED AP Homes', 'Green Business Certification Inc.', 'LEED Green Associate', 'Green Business Certification Inc.', 'LEED', false],
  ['Certified Personal Trainer', 'PTA Global', 'Certified Personal Trainer', 'National Academy of Sports Medicine', 'CPT', false],
  ['Registered Medical Assistant', 'American Phlebotomy Association (APA)', 'Registered Medical Assistant', 'American Medical Technologists', 'RMA', false],
  ['Phlebotomy Technician Certification', '', 'Phlebotomy Technician', 'American Society for Clinical Pathology', 'PBT(ASCP)', false],
  ['Certified Medical Assistant', 'Tennessee Department of Health', 'Certified Medical Assistant', 'American Association of Medical Assistants', 'CMA', false],
  ['Certified Physician Assistant - Psychiatry', 'National Commission on Certification of Physician Assistants', 'Physician Assistant - Certified', 'National Commission on Certification of Physician Assistants', 'PA-C', false],
];

let fail = 0;
for (const [on, oi, cn, co, ca, want] of cases) {
  const m = findMatches({ id: 'x', name: on, issuer: oi }, [{ Id: '1', Name: cn, Organization: co, Acronym: ca }]);
  const got = m.length > 0;
  if (got !== want) {
    fail++;
    console.log(`FAIL want=${want} got=${got}: "${on}" [${oi}] vs "${cn}" [${co}] keys=${nameKey(on)} | ${nameKey(cn)} issuerOk=${issuerOk(co, oi)}`);
  }
}
console.log(`${cases.length - fail}/${cases.length} passed`);
console.log(keywordFor('Phlebotomy Technician - PBT(ASCP)'), '|', keywordFor('Certified Energy Manager ®  (CEM®)'), '|', keywordFor('C/EH & Co+ "x"'));
