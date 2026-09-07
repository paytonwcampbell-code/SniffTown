const base = process.env.SUPABASE_URL?.replace(/\/+$/, '');
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!base || !key) throw new Error('Supabase service access is not configured');
const auth = { apikey: key, Authorization: `Bearer ${key}` };
async function request(path, init = {}) {
  const response = await fetch(`${base}${path}`, { ...init, headers: { ...auth, ...(init.headers || {}) } });
  const text = await response.text();
  if (!response.ok) throw new Error(`${response.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}
const official = [
  ['Walnut Creek Metro Park','12138 N Lamar Blvd.'],['Red Bud Isle','3401 Red Bud Trl.'],['Great Lawn at Zilker Metro Park','2100 Barton Springs Rd.'],['Mary Moore Searight Metro Park','907 W Slaughter Ln.'],['Davis-White Northeast Neighborhood Park','6705 Crystalbrook Dr.'],['Great Northern Dam Far West','694 Shoal Creek Blvd.'],['Onion Creek Greenbelt','7004 Onion Creek Dr.'],['Shoal Creek Greenbelt','2610 Shoal Creek Blvd.'],['West Austin Neighborhood Park','1317 W 10th St.'],['Barking Springs at Zilker Metro Park','2105 Andrew Zilker Rd.'],['Riverside Shores','1016 Edgecliff Terrace'],['Auditorium Shores','1100 W Riverside Dr.'],['Emma Long Metro Park','1711 City Park Rd.'],['Canyon Ridge Pocket Park','12217 N IH 35 SVRD NB'],['Oertli Neighborhood Park','1238 Pearl Retreat Ln.'],['Triangle Commons Neighborhood Park','722 W 46th St.'],['Carson Ridge Bark Park','2511 Montopolis Dr.'],['Jain Bark Park','5400 Jain Ln.'],['Kramer Creek Bark Park','2401 Esperanza Crossing'],['Metropolitan Pocket Park','10300 Metropolitan Dr.'],['West Bouldin Creek Greenbelt','1515 S Lamar Blvd.'],['Double Creek Bark Park','600 E FM 1626 Rd.'],['Walden Bark Park','4907 Springdale Rd.'],['Little Walnut Creek Greenbelt','5100 E 51st St.'],['Park Ridge Neighborhood Park','8603 Cullen Ln.'],['Royal Crest Pocket Park','1919 East Riverside Dr.'],['Burnet Lane Pocket Park','6801 Burnet Rd.'],['Alexander Pocket Park','1909 Alexander Ave.'],['Double Creek Neighborhood Park','10801 Brezza Ln.']
];
const aliases = new Map([['Walnut Creek Metro Park','Walnut Creek Park'],['Mary Moore Searight Metro Park','Mary Moore Searight']]);
const slugify = s => s.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
const parks = await request('/rest/v1/parks?select=*&order=name.asc');
const packs = await request('/rest/v1/packs?select=*&order=name.asc');
const parkTemplate = parks[0], packTemplate = packs[0];
let insertedParks=0, insertedPacks=0, updated=0;
for (const [officialName,address] of official) {
  const lookup=aliases.get(officialName)||officialName;
  let park=parks.find(p=>p.name===lookup||p.name===officialName);
  if (!park) {
    const id=crypto.randomUUID();
    park={id,name:officialName,city:'Austin',state:'TX',slug:`${slugify(officialName)}-${id.slice(0,8)}`,description:'Official City of Austin designated dog off-leash area.',metro_id:parkTemplate.metro_id,created_by:parkTemplate.created_by};
    await request('/rest/v1/parks',{method:'POST',headers:{'Content-Type':'application/json',Prefer:'return=minimal'},body:JSON.stringify(park)});
    parks.push(park); insertedParks++;
  } else {
    await request(`/rest/v1/parks?id=eq.${encodeURIComponent(park.id)}`,{method:'PATCH',headers:{'Content-Type':'application/json',Prefer:'return=minimal'},body:JSON.stringify({description:'Official City of Austin designated dog off-leash area.'})});
  }
  let pack=packs.find(p=>p.id===park.id);
  const values={name:`${officialName} Pack`,location:address,description:`Local dog community for ${officialName}, an official City of Austin off-leash area.`,is_public:true,tags:Array.from(new Set([...(Array.isArray(pack?.tags)?pack.tags:[]),'off-leash']))};
  if (!pack) {
    pack={id:park.id,creator_id:packTemplate.creator_id,activity_level:packTemplate.activity_level,play_style:packTemplate.play_style,max_members:packTemplate.max_members,join_method:packTemplate.join_method,discoverability:packTemplate.discoverability,preview_level:packTemplate.preview_level,show_human_names:packTemplate.show_human_names,hide_events_until_joined:packTemplate.hide_events_until_joined,...values};
    await request('/rest/v1/packs',{method:'POST',headers:{'Content-Type':'application/json',Prefer:'return=minimal'},body:JSON.stringify(pack)});
    packs.push(pack); insertedPacks++;
  } else {
    await request(`/rest/v1/packs?id=eq.${encodeURIComponent(pack.id)}`,{method:'PATCH',headers:{'Content-Type':'application/json',Prefer:'return=minimal'},body:JSON.stringify(values)});
  }
  updated++;
}
const vp=await request('/rest/v1/parks?select=id,description');
const vk=await request('/rest/v1/packs?select=id,tags');
const ids=new Set(vp.filter(p=>p.description==='Official City of Austin designated dog off-leash area.').map(p=>p.id));
const paired=vk.filter(p=>ids.has(p.id)&&Array.isArray(p.tags)&&p.tags.includes('off-leash')).length;
console.log(JSON.stringify({officialCurrentAreas:official.length,insertedParks,insertedPacks,taggedAndPaired:paired,futureCircleCSiteExcluded:true}));
