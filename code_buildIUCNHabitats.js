var kaspian_seafix = 
    /* color: #d63000 */
    /* shown: false */
    ee.FeatureCollection(
        [ee.Feature(
            ee.Geometry.Polygon(
                [[[50.18038630001961, 39.77872317044922],
                  [50.18038630001961, 37.87891402335348],
                  [52.11398005001961, 37.87891402335348],
                  [52.11398005001961, 39.77872317044922]]], null, false),
            {
              "system:index": "0"
            }),
        ee.Feature(
            ee.Geometry.Polygon(
                [[[49.6180574638418, 42.630888564946225],
                  [49.6180574638418, 40.98504149687882],
                  [51.5955965263418, 40.98504149687882],
                  [51.5955965263418, 42.630888564946225]]], null, false),
            {
              "system:index": "1"
            }),
        ee.Feature(
            ee.Geometry.Polygon(
                [[[48.7061922294668, 43.918631262542625],
                  [48.7061922294668, 42.27422108236781],
                  [50.3651277763418, 42.27422108236781],
                  [50.3651277763418, 43.918631262542625]]], null, false),
            {
              "system:index": "2"
            }),
        ee.Feature(
            ee.Geometry.Polygon(
                [[[47.97305592192894, 42.67203632356086],
                  [47.97305592192894, 42.502174262916576],
                  [48.449587904350814, 42.502174262916576],
                  [48.449587904350814, 42.67203632356086]]], null, false),
            {
              "system:index": "3"
            }),
        ee.Feature(
            ee.Geometry.Polygon(
                [[[48.12686451567894, 42.452543985758226],
                  [48.12686451567894, 42.40084618145372],
                  [48.194155775444564, 42.40084618145372],
                  [48.194155775444564, 42.452543985758226]]], null, false),
            {
              "system:index": "4"
            }),
        ee.Feature(
            ee.Geometry.Polygon(
                [[[50.71881499087915, 40.30021437711546],
                  [50.71881499087915, 40.299167006755376],
                  [50.72018828189478, 40.299167006755376],
                  [50.72018828189478, 40.30021437711546]]], null, false),
            {
              "system:index": "5"
            }),
        ee.Feature(
            ee.Geometry.Polygon(
                [[[50.7270547369729, 40.30021437711546],
                  [50.7270547369729, 40.194347991600246],
                  [50.92618193423853, 40.194347991600246],
                  [50.92618193423853, 40.30021437711546]]], null, false),
            {
              "system:index": "6"
            })]);

/*
This is the script for producing a global composite layer containing classes comparable
to the IUCN habitat classification. 
The idea is to do a two-step (Level 1, then Level 2) hierarchical mapping intersecting
land cover, climatic and other layers (including land use). 
The script has parameters that allow specifiying different masks. For using different input adaptions to the decision tree
have to be made.
It generates a number of output products - for each class - that can be individually exported
or in the end as overal composite layer.

Scheme: https://www.iucnredlist.org/resources/habitat-classification-scheme
Author: Martin Jung | Email: jung@iiasa.ac.at
License: CC-BY 4.0
Citation: Jung, M., Dahal, P.R., Butchart, S.H.M., Donald, P.F., De Lamo, X., Lesiv, M., Kapos, V., Rondinini, C., Visconti, P., 2020. A global map of terrestrial habitat types. Sci. Data 7, 256. https://doi.org/10.1038/s41597-020-00599-8
*/

// Parameters
var level = 1; // Options 1 | 2 of the IUCN hierarchy
var scale = 100; // Output scale (1000 is recommended, 100 Copernicus, 250m for PNV)
var year = 2019; // Which Copernicus year to use
var output_path = 'habitattypes'; // Google drive output folder
var toasset = true; // Should the map be exported to an asset or google drive?
var reduceToCop = false; // Should the output be reduced to copernicus resolution?
var pasture_mask = ['glwd','hyde','hoskins'][0]; // Use gridded livestock density of the world dataset, Hyde or Hoskins as pasture mask
var calculate_pnv = false; // Calculate potential natural vegetation instead (Normally Irrelavent)
var version = "004"; // Current version of the habitat type layer
var export_classes = false; // (true|false) Should individual classes rather than the composite be exported?
var exportRegion = ee.Geometry.Rectangle([-180, -90, 180, 90], null, false); // Export region (leave unchanged, unless smaller areas need to be exported)

// -------------------------------------------------------------------- //
// Input asset data (not all required) //
var copernicus = ee.Image("COPERNICUS/Landcover/100m/Proba-V-C3/Global/" + year).select('discrete_classification'); // Copernicus asset - Google Earth Engine Asset
var treecover = ee.Image("COPERNICUS/Landcover/100m/Proba-V-C3/Global/" + year).select('tree-coverfraction'); // Copernicus asset - Google Earth Engine Asset
if(year > 2015){
  // Loading changemask for later years
  var changemask = ee.Image("COPERNICUS/Landcover/100m/Proba-V-C3/Global/" + year).select('change-confidence'); // Change Confidence mask
  // Get grid cells with medium or higher confidence of change
  changemask = changemask.expression('b(0) >= 2');
  Map.addLayer(changemask.randomVisualizer(),{},'Changemask',0);
}
print('Loaded Copernicus for year ' + year);

// The rest of the assets
var koeppen = ee.Image("users/Uploads/beck_koeppenpresent_1km_expanded5km"); // Source: https://doi.org/10.1038/sdata.2018.214
var srtm = ee.Image("CGIAR/SRTM90_V4"); // Google Earth Engine Asset
var cifor_wetland = ee.Image("users/Uploads/TROP-SUBTROP_WetlandV2_2016_CIFOR"); // Source: https://doi.org/10.1111/gcb.13689
var gmw_mangroves = ee.Image('users/Uploads/naturemap_otherdata/GMW_2015_mangroves'); // https://data.unep-wcmc.org/datasets/45
var glwd = ee.Image("users/Uploads/GLWD_GlobalLakesWetlands"); // Source: https://doi.org/10.1016/j.jhydrol.2004.03.028
var hydrolakes = ee.Image('users/Uploads/naturemap_otherdata/hydrolakes_100m').selfMask(); // Source: https://www.hydrosheds.org/pages/hydrolakes
var GSW = ee.Image("JRC/GSW1_1/GlobalSurfaceWater").select('transition'); // Source: (doi:10.1038/nature20584)
var intertidal = ee.Image("UQ/murray/Intertidal/v1_1/global_intertidal/2014-2016"); // Source:  Murray, N.J., Phinn, S.R., DeWitt, M., Ferrari, R., Johnston, R., Lyons, M.B., Clinton, N., Thau, D. & Fuller, R.A. (2019) The global distribution and trajectory of tidal flats. Nature, 565, 222-225.
var iiasa_smallfields = ee.Image("users/Uploads/IIASA_smallfields"); // Source: https://onlinelibrary.wiley.com/doi/full/10.1111/gcb.14492
var k1 = ee.Image("users/Uploads/k1classes"); // Level 1 class from https://doi.org/10.1659/MRD-JOURNAL-D-17-00107.1
var alpineBiomes = ee.Image('users/Uploads/naturemap_otherdata/AlpineShapes'); // Rasterized from https://onlinelibrary.wiley.com/doi/10.1111/ecog.05012
var biomes = ee.Image("users/Uploads/biomes_1km_expanded5km"); // Reclassified Google Earth Engine Asset
var biomecog = ee.FeatureCollection("RESOLVE/ECOREGIONS/2017"); // Google Earth Engine Asset
var FMlayer = ee.Image("users/Uploads/naturemap_otherdata/FML_v32"); // Small fix for nodata values. equal to zenodo version
//var FMlayer = ee.Image('users/Uploads/naturemap_otherdata/plantation_extent'); // Source: https://zenodo.org/record/3931930/
var pasture = ee.Image("users/Uploads/naturemap_otherdata/PAS_1km_2005_0ice"); // Source: https://doi.org/10.1002/ece3.2104
var globallivestockdensity = ee.Image("users/Uploads/naturemap_otherdata/LifestockDensity_grazingonly_mask_Aw_LSU"); // Prepared mask, data from Source: http://dx.doi.org/10.1038/sdata.2018.227
var hyde = ee.Image("users/Uploads/naturemap_otherdata/HYDEPasture2015_fraction"); // Source: https://doi.org/10.1007/s10584-011-0153-2
var pnv = ee.Image("users/Uploads/habitattypes/pnv_potentiallandcover_probavlc100_c_250m_s00cm_2017_v05"); // Potential natural land cover (only available as variant)
// Add Caspian sea fix //
var kaspian_seafix_image = ee.Image().byte();
kaspian_seafix_image = kaspian_seafix_image.paint({
  featureCollection: kaspian_seafix,
  color: 1
});
// --------------------------------- //
// --> Marine data
// Global seabed geomorphic data
var marine_seabedzones = ee.Image('users/Uploads/naturemap_otherdata/marine/HarrisEtAl_SeafloorGeomorphic_rasterized');
var abyss_class = ee.FeatureCollection('users/Uploads/naturemap_otherdata/marine/HarrisEtAl_AbyssClassification'); 
var seamounts = ee.FeatureCollection('users/Uploads/naturemap_otherdata/marine/YessonEtAl_SeamountsBaseAreaSmoothed');
var vents = ee.FeatureCollection('users/Uploads/naturemap_otherdata/marine/RamirezLlodraAndBaker_seavents_outdated');
var ocean_bedrock = ee.Image('NOAA/NGDC/ETOPO1').select('bedrock'); // Ocean bedrock
var coral_reefs = ee.FeatureCollection('users/Uploads/naturemap_otherdata/marine/WRI_reefsAtRisk_smoothedmultipart'); // WRI Reefs at Risk
var seagrass = ee.FeatureCollection('users/Uploads/naturemap_otherdata/marine/JayathilakeAndCostello_Seagrass_smoothed');  // Jayathilake D.R.M., Costello M.J. 2018. A modelled global distribution of the seagrass biome. Biological Conservation. https://doi.org/10.1016/j.biocon.2018.07.009
// Kelp -> https://biogeoscienceslaboxford.users.earthengine.app/view/kelpforests
// -------------------------------------------------------------------- //
// #################################################################### //
//                      Start of code
// #################################################################### //
// -------------------------------------------------------------------- //
var reprojectImage = function(image){
  // Use the Beck et al. Koeppen layer as reference template
  if(scale < 500){
    // If scale is below 500 use copernicus other koeppen for 1km
    var targProj = copernicus.projection();
  } else {
    var targProj = koeppen.projection();
  }
  image = image.reproject({crs: targProj});
  var res = image.reproject(image.projection())
    // Force the next reprojection to aggregate instead of resampling.
    .reduceResolution({
      reducer: ee.Reducer.mode(),
      maxPixels: 1024
    })
    // Request the data at the scale and projection at gfsad
    .reproject({
      crs: targProj
  });
  return(res);
};

// Function for adding a changemask
var updateComposite = function(comp_earlier,changemask){
  // Mask out all gridcells from previous year
  var y = comp_earlier.mask(changemask.unmask().expression('b(0) == 0'));
  var z = y.unmask().add(changemask.unmask());
  return(z);
};

var createOutput = function(image,output_path,name,scale){
  // Export wrapper
  if(toasset){
      Export.image.toAsset({
      image: image,
      description: name,
      assetId: output_path,
      scale: 100, // Overwrote this since this is the default projection
//      scale: image.projection().nominalScale().getInfo(),
      region: exportRegion,
      maxPixels: 1e13,
      pyramidingPolicy: {
      '.default': 'mode',
      }
    });
  } else {
      Export.image.toDrive({
      image: image,
      description: name,
      folder: output_path,
      scale: scale,
//      scale: image.projection().nominalScale().getInfo(),
      region: exportRegion,
      fileFormat: 'GeoTIFF',
      maxPixels: 1e12,
      formatOptions: {
        cloudOptimized: false
      }
    });
  }
};

// Resampling function to Copernicus
var resampleToCopernicus = function(image){
 var res = image.resample('bilinear').reproject({
    crs: copernicus.projection().crs(),
    scale: copernicus.projection().nominalScale()
  }); 
  return(res);
};

// --------------------------------------------- //
print('Preparing input data');

// Get ther elevation data from the SRTM mission
var elevation = srtm.select('elevation'); 
var elev_products = ee.Terrain.products(elevation);

// Now prepare global mountain mask
var mountains = k1.rename('mountains');
if(reduceToCop){mountains = resampleToCopernicus(mountains);}

// -------------  //
// Köppen-Geiger climate zoneing by Beck et al.
koeppen = koeppen.rename('koeppen');
if(reduceToCop){koeppen = resampleToCopernicus(koeppen);}

// IIASA small field dataset
//iiasa_smallfields = iiasa_smallfields//.expression('b(0) == 3506 || b(0) == 3505').rename('iiasa_smallfields');
if(reduceToCop){iiasa_smallfields = resampleToCopernicus(iiasa_smallfields);}

// Forest management layer
var forestmanagement = FMlayer.rename('plantation');
//11 – forest without any signs of human impact
//20 - forest with signs of human impact, including clear cuts, logging, built-up roads. 
//31 – replanted forest, forest with rotation period longer than 20 years
//32 - woody plantations, rotation period of maximum 15 years
//40 – oil palm plantations
//53 – agroforestry, including fruit tree plantations, tree shelterbelts, individual trees on pastures
forestmanagement = forestmanagement.expression('b(0) >= 31 && b(0) <= 53').rename('plantation');
// No resampling necessary. Already at Copernicus resolution

// Prepare the Land cover data
if(calculate_pnv){
  var LC = pnv; // Normal Copernicus layer
  var pnv_watermask = hydrolakes.expression('b(0) >0').unmask().remap([1],[80]);
  LC = LC.unmask(pnv_watermask);
} else {
  var LC = copernicus; // Normal Copernicus layer
}
// Global land area mask for the marine class
var land_mask = LC.unmask().expression('b(0) < 200 && b(0) != 0');
// Create buffered landmask to be set to neritic if no other marine class present
var land_buffered = land_mask.unmask().distance(ee.Kernel.euclidean({radius:50,units:'pixels'}))
.expression('b(0)>0').selfMask();
// Now remove areas with positive elevation
var land_buffered2 = land_buffered.addBands(elevation).expression('b(0) == 1 && b(1) > 0');
land_buffered = land_buffered.subtract(land_buffered2.unmask()).selfMask();

// Resample the bedrock data
ocean_bedrock = ocean_bedrock.resample('bilinear');

// Same for the abyss classifcation
abyss_class = abyss_class
  .filter(ee.Filter.notNull(['code']))
  .reduceToImage({
    properties: ['code'],
    reducer: ee.Reducer.max()
});
// For the Seamounts
seamounts = seamounts
.filter(ee.Filter.notNull(['code']))
  .reduceToImage({
    properties: ['code'],
    reducer: ee.Reducer.max()
});
// Vents
vents = vents.map(function(f){ return f.buffer(1000)})
.filter(ee.Filter.notNull(['code']))
  .reduceToImage({
    properties: ['code'],
    reducer: ee.Reducer.max()
});

// Coral Reefs
coral_reefs = coral_reefs
.filter(ee.Filter.notNull(['code']))
  .reduceToImage({
    properties: ['code'],
    reducer: ee.Reducer.max()
});
// Seagrass
// Coral Reefs
seagrass = seagrass
.filter(ee.Filter.notNull(['code']))
  .reduceToImage({
    properties: ['code'],
    reducer: ee.Reducer.max()
});

// Buffered Mangroves for overlap with intertidal area
var mangrove_buffered = gmw_mangroves
.convolve(ee.Kernel.euclidean({radius:500,units:'meters'})).expression('b(0)>0');

// ---- //
// Apply a focal_mode filter to the GLWD data to account for wall-wall uncertainties. 
// This will only affect the classes within the tenary statement
glwd = glwd.focal_mode(5); // 5 Units
if(reduceToCop){glwd = resampleToCopernicus(glwd);}

// Prepare the CIFOR Tropical wetland layer
// Please cite this work as: Gumbricht et al. (2017) An expert system model for mapping tropical wetlands and peatlands reveals South America as the largest contributor. Global Change Biology. DOI: 10.1111/gcb.13689
// Open Water = 10 | Mangrove = 20 | Swamps = 30 | Fens = 40 | Riverine and lacustrine = 50 | Floodplains = 60/70
// Marshed = 80/90/100
if(reduceToCop){  cifor_wetland = resampleToCopernicus(cifor_wetland);}

// Copernicus tree cover. Project to 1km and reduce by average
if(calculate_pnv){
  // Assume 100% tree cover everywhere by default
  var treecovermask = ee.Image.constant(100).rename('treecovermask');
} else {
  var treecovermask = treecover.rename('treecovermask');
  if(reduceToCop){
    var treecovermask = treecovermask.reproject({crs: koeppen.projection()})
      .reduceResolution({
            reducer: ee.Reducer.mean(),
            maxPixels: 1024
      });
  }
}

// For degraded forest?
// TODO:
//var copernicus = ee.ImageCollection("COPERNICUS/Landcover/100m/Proba-V/Global").select('discrete_classification').max(); // Copernicus asset - Google Earth Engine Asset
//var treecover = ee.ImageCollection("COPERNICUS/Landcover/100m/Proba-V/Global").select('tree-coverfraction').max(); // Copernicus asset - Google Earth Engine Asset
//var x = copernicus.addBands(treecover).expression('b(0) & (b(1) < 25)').selfMask()
//Map.addLayer(x)

// Get the Global biomes and realms
biomes = biomes.rename('biomes');

// Global tropics & subtropics mask
//var subtropics = ee.Image.pixelLonLat().select('latitude').expression("b(0) >= -23.5 && b(0) <= 23.5").selfMask();
var subtropics = biomes.addBands( ee.Image.pixelLonLat().select('latitude').expression("b(0) >= -23.5 && b(0) <= 23.5") ).expression('b(0) >= 1 && b(0) <= 3 || b(0) == 7 || b(1) == 1 ').selfMask();// Subtropics based on biomes
// For Rural gardens we create a mask that convolves close to urban/rural areas
var urban_boundary_ring = LC.expression("b(0) == 50").convolve(ee.Kernel.euclidean({radius:500,units:'meters'})).expression('b(0)>0');
var urban_boundary = urban_boundary_ring.subtract( LC.expression("b(0) == 50") ).selfMask();
if(reduceToCop){urban_boundary = resampleToCopernicus(urban_boundary)}

print('Using pasture mask = ',pasture_mask);
if(pasture_mask === 'glwd'){
  // Thresholded gridded livestock of the world data
  var pasture = globallivestockdensity.rename('glwd').addBands(koeppen).addBands(LC.rename('LC'));
  pasture = pasture.expression(
    "((glwd >= 1) &&  ( (koeppen >= 1 && koeppen <= 2) || (koeppen >= 8 && koeppen <= 16) || (koeppen >= 17 && koeppen <= 18) || (koeppen >= 21 && koeppen <= 22) || (koeppen >= 25 && koeppen <= 26) )) ? 1" +
    ": 0",
    {
      'glwd': pasture.select('glwd'),
      'LC': pasture.select('LC'),
      'koeppen': pasture.select('koeppen')
    });
  pasture = pasture.rename('pasture');//lifestock_density.rename('pasture');// Make a global mask
} else if(pasture_mask === 'hoskins') {
  // Make global pasture mask with raw hoskins dat
  var pasture = pasture.rename('hoskins').addBands(mountains).addBands(biomes.rename('biomes')).addBands(LC.rename('LC')).addBands(koeppen);
  pasture = pasture.expression(
    // Tropical climates
//      "(koeppen >= 1 && koeppen <= 3) && ((LC == 30 && hoskins > 0.5) || (LC == 20 && hoskins > 0.5)) ? 1 " +
    // Arid climates
//    ": (koeppen >= 4 && koeppen <= 8) && ((LC == 30 && hoskins > 0.9) || (LC == 20 && hoskins > 0.9)) ? 1 " +
    // Temperate climates
//    ": (koeppen >= 9 && koeppen <= 27) && ((LC == 30 && hoskins > 0.5) || (LC == 20 && hoskins > 0.5)) ? 1 " +
    // Bare spare vegetation and moss lichen set to a different threshold
//    ": (LC == 100 && hoskins > 0.8) || (LC == 60 && hoskins > 0.8) ? 1 " +
    "(hoskins >= 0.5) ? 1" +
    ": 0",
    {
      'hoskins': pasture.select('hoskins'),
      'LC': pasture.select('LC'),
      'biome': pasture.select('biomes'),
      'mountains': pasture.select('mountains').expression('b(0) >= 1'),
      'koeppen': pasture.select('koeppen')
    });
  pasture = pasture.rename('pasture');//lifestock_density.rename('pasture');// Make a global mask
  //Map.addLayer(pasture.selfMask().randomVisualizer());
} else if(pasture_mask === 'hyde') {
  // Apply a threshold of 50% pasture cover
  var pasture = hyde.expression('b(0) > .5').rename('pasture')
}

if(reduceToCop){pasture = resampleToCopernicus(pasture);}

// -------------------------------------------------------------------- //
// #################################################################### //

print('Processing Rocky areas and deserts - 6 + 8');
var iucn_desert_lvl1 = LC.expression('b(0) == 60 || b(0) == 70 || b(0) == 100').rename('desert');
if(calculate_pnv){
  iucn_desert_lvl1 = LC.expression('b(0) == 60 || b(0) == 70 || b(0) == 100 || b(0) == 21').rename('desert');
}
iucn_desert_lvl1 = iucn_desert_lvl1.addBands(koeppen).addBands(mountains).addBands(LC.rename('LC')).addBands(elev_products);
iucn_desert_lvl1 = iucn_desert_lvl1.expression(
    "((LC == 60 || LC == 100) && ( mountains <= 3 || slope > 8.75 ) ) ? 600" + // 6 Rocky Areas (e.g., inland cliffs, mountain peaks)
    ": (desert == 1 && ((koeppen >= 4 && koeppen <= 7) || koeppen >= 29)) ? 800" + // 800 Desert
    ": (koeppen == 29 || koeppen == 30) ? 800" + // Everything icy being a desert otherwise
    ": 0 ",{ 
      'desert': iucn_desert_lvl1.select('desert'),
      'LC': iucn_desert_lvl1.select('LC'),
      'mountains': iucn_desert_lvl1.select('mountains'),
      'slope': iucn_desert_lvl1.select('slope'),
      'elevation': iucn_desert_lvl1.select('elevation'),
      'koeppen': iucn_desert_lvl1.select('koeppen')
}).rename('comp');
// Mask out land area
iucn_desert_lvl1 = iucn_desert_lvl1.selfMask();

// ------- 
var iucn_desert_lvl2 = iucn_desert_lvl1.rename('desert');
iucn_desert_lvl2 = iucn_desert_lvl2.addBands(koeppen).addBands(elev_products.select('elevation'));
iucn_desert_lvl2 = iucn_desert_lvl2.expression(
    "(desert == 600) ? 600" + // Rocky cliff
    ": (desert == 800 && koeppen == 4) ? 801" + // 8.1. Desert – Hot
    ": (desert == 800 && (koeppen >= 5 && koeppen <= 6)) ? 802" + // 8.2. Desert – Temperate
    ": (desert == 800 && (koeppen == 7 || koeppen >= 29)) ? 803" + // 8.3. Desert – Cold
    ": (desert == 800) ? 800" +
    ": 0 ",{ 
      'desert': iucn_desert_lvl2.select('desert'),
      'elevation': iucn_desert_lvl2.select('elevation'),
      'koeppen': iucn_desert_lvl2.select('koeppen')
}).rename('comp');
// Mask out land area
iucn_desert_lvl2 = iucn_desert_lvl2.selfMask();

// -------------------------------------------------------------------- //
print('Processing artifical terrestrial - 14');
var iucn_artific = LC.rename('artific'); // Take all land cover classes for now
iucn_artific = iucn_artific.addBands(pasture).addBands(iiasa_smallfields.rename('iiasa_smallfields')).addBands(subtropics.unmask().add(1).rename('subtropics'))
.addBands(urban_boundary.rename("urbanboundary"))
.addBands(mountains.selfMask())
.addBands(treecovermask)
.addBands(forestmanagement)
.addBands(iucn_desert_lvl1.rename("desert"));

var iucn_artific = iucn_artific.expression(
    "((subtropics == 2 && iiasa_smallfields == 1) && (LC == 40 && urbanboundary == 1) ) ? 1404" + // 14.4 Rural Gardens
    ": (LC == 40 ) ? 1401" + // 14.1 Arable Land
    ": ((LC == 30 || LC == 20 || LC == 100 || LC == 60) && pasture == 1) ? 1402" + // 14.2 Pastureland
    ": (plantation == 1 && ((LC >= 111 && LC <= 116) || ((LC >= 111 && LC <= 126) && subtropics == 1  )) ) ? 1403" + // 14.3 Plantations
    ": (LC == 50 ) ? 1405" + // 14.5 Urban Areas
    ": (LC == 50 || LC == 40 ) ? 1400" + // Alternative
    ": 0 ",{ // Other class
      'LC': iucn_artific.select('artific'),
      'urbanboundary': iucn_artific.select('urbanboundary'),
      'pasture': iucn_artific.select('pasture'),
      'treecovermask' : iucn_artific.select('treecovermask'),
      'mountains': iucn_artific.select('mountains').expression('b(0) >= 1'),
      'plantation': iucn_artific.select('plantation'),
      'subtropics': iucn_artific.select('subtropics'),
      'iiasa_smallfields': iucn_artific.select('iiasa_smallfields')
}).rename('comp');
// Mask out land area

// Use PNV instead
if(calculate_pnv){
  // No artifical land cover's in here, so empty image
  iucn_artific = ee.Image.constant(0).rename('comp');
} else { 
  iucn_artific = iucn_artific.unmask();
}

print('Starting with forest - 1');
var iucn_forest_lvl1 = LC.expression('(b(0) >= 111 && b(0) <= 126) ').rename('forest');
if(calculate_pnv){
  iucn_forest_lvl1 = LC.expression('(b(0) >= 111 && b(0) <= 127) ').rename('forest');
}
iucn_forest_lvl1 = iucn_forest_lvl1.addBands(koeppen).addBands(treecovermask)
.addBands(gmw_mangroves.unmask().rename('mangroves'))
.addBands(LC.rename('LC'));

// Edited so that mangroves overrule Copernicus if in doubt
var iucn_forest_lvl1 = iucn_forest_lvl1.expression(
    "(LC >= 111 && LC <= 116) ? 100" + // All closed forest 
    ": ( mangroves == 1 && ((LC == 90 || LC == 20 ) || (LC >= 121 && LC <= 126) ) )  ? 100" + // Special case for mangrove vegetation
    ": (forest == 1 && treecovermask >= 50) ? 100" + // Forest 
    ": 0",{ 
      'forest': iucn_forest_lvl1.select('forest'),
      'LC': iucn_forest_lvl1.select('LC'),
      'mangroves': iucn_forest_lvl1.select('mangroves'),
      'treecovermask': iucn_forest_lvl1.select('treecovermask'),
      'koeppen': iucn_forest_lvl1.select('koeppen')
}).rename('comp');
// Self Mask
iucn_forest_lvl1 = iucn_forest_lvl1.selfMask();
// Map out anything that is artifical
iucn_forest_lvl1 = iucn_forest_lvl1.updateMask(iucn_artific.expression('(b(0) == 0)'));

// -------------------- //
// For Level 2
if(calculate_pnv){
  // Take the mangrove class
  var pot_mangroves = LC.expression('b(0) == 127');
  var subtropics = subtropics.unmask().add(1).rename("subtropics");
  var swamps = cifor_wetland.addBands(koeppen).expression('b(0)>20 && (b(1) >=1 && b(1) < 3) ');

  var iucn_forest_lvl2 = iucn_forest_lvl1.rename('forest');
  iucn_forest_lvl2 = iucn_forest_lvl2.addBands(koeppen)
    .addBands(LC.rename("LC"))
    .addBands(biomes)
    .addBands(subtropics)
    .addBands(mountains).addBands(ee.Image.pixelLonLat())
    .addBands(swamps.rename('swamp')) // Wetland cifor set to 1
    .addBands(pot_mangroves.rename('mangroves'))
    .addBands(elev_products.select('elevation'));
} else{
  var iucn_forest_lvl2 = iucn_forest_lvl1.rename('forest');
    iucn_forest_lvl2 = iucn_forest_lvl2.addBands(koeppen)
    .addBands(LC.rename("LC"))
    .addBands(biomes)
    .addBands(subtropics.unmask().add(1).rename("subtropics"))
    .addBands(mountains).addBands(ee.Image.pixelLonLat())
    .addBands(gmw_mangroves.unmask().rename('mangroves'))
    .addBands(cifor_wetland.expression('b(0) >= 30 && b(0) <= 60').rename('swamp'))
    .addBands(elev_products.select('elevation'));
}

var iucn_forest_lvl2 = iucn_forest_lvl2.expression(
    "((forest == 100 && mountains == 1 && subtropics == 2) && ((koeppen >=1 && koeppen < 3) || ((koeppen == 12 || koeppen == 15) && elevation >= 1200 ) || ((koeppen >= 8 && koeppen <= 9) && biome == 3)) || ((biome == 10 || biome ==1) && (koeppen >= 9 && koeppen <= 10)  ) || ( (biome == 1 && koeppen >=22) || (biome == 10 && koeppen >=29)) ) ? 109" + // 1.9. Forest – Subtropical/tropical moist montane    
    ": ((forest == 100 && mangroves == 1 ) ) ? 107" + // 1.7. Forest – Subtropical/tropical mangrove vegetation above high tide level
    ": ( mangroves == 1 && ((LC == 90 || LC == 20 ) || (LC >= 121 && LC <= 126) ) )  ? 107" + // 1.7. Forest – Subtropical/tropical mangrove vegetation above high tide level
    ": (forest == 100 && swamp == 1) ? 108" + // 1.8. Forest – Subtropical/tropical swamp
    ": (forest == 100 && ((koeppen >= 1 && koeppen <= 2) || (koeppen == 11) || ( subtropics == 2 && (koeppen >= 12 && koeppen <= 15 )) || (subtropics == 2 && ((koeppen >= 8 && koeppen <= 9) && biome == 3)) ) ) ? 106" + // 1.6. Forest – Subtropical/tropical moist lowland
// Moved temperate here
    ": ((forest == 100 && subtropics == 1) && ((koeppen >= 8 && koeppen <= 10) || ( koeppen >= 12 && koeppen <= 16) || (koeppen >= 17 && koeppen <= 18) || (koeppen >= 21 && koeppen <= 26) || ( biome >= 4 && biome <= 5) || (biome == 8 && koeppen == 7)  ) ) ? 104" + // 1.4. Forest – Temperate
    ": (forest == 100 && ((subtropics == 2 && (koeppen >= 3 && koeppen <= 7)) || (biome >= 12 && biome <= 13) || (biome == 2) ||  (biome == 8 && (koeppen == 6 || koeppen == 4) ) ) ) ? 105" + // 1.5. Forest – Subtropical/tropical dry
    ": (forest == 100 && (biome == 11 && koeppen == 30 )) ? 102" + // 1.2. Forest - Subarctic
    ": (forest == 100 && (latitude > 45 && ((koeppen >= 27 && koeppen <= 29) || (koeppen >= 19 && koeppen <= 20) || (koeppen >= 23 && koeppen <= 24) || (biome == 6 && koeppen == 7) )) ) ? 101" + // 1.1. Forest – Boreal
    ": (forest == 100 && ((latitude < 0 && subtropics == 1) && (koeppen == 16 || (koeppen >= 29 && koeppen <= 30 )) ) ) ? 103" + // 1.3. Forest – Subantarctic
    ": (forest == 100) ? 100" + // Higher class. Identity unknown
    ": 0",{ 
      'forest': iucn_forest_lvl2.select('forest'),
      'LC': iucn_forest_lvl2.select('LC'),
      'biome' : iucn_forest_lvl2.select('biomes'),
      'koeppen': iucn_forest_lvl2.select('koeppen'),
      'mangroves': iucn_forest_lvl2.select('mangroves'),
      'mountains': iucn_forest_lvl2.select('mountains').expression('b(0) >= 1'),
      'elevation': iucn_forest_lvl2.select('elevation'),
      'swamp' : iucn_forest_lvl2.select('swamp'),
      'subtropics' : iucn_forest_lvl2.select('subtropics'),
      'latitude': iucn_forest_lvl2.select('latitude')
}).rename('comp');
// Mask out land area
iucn_forest_lvl2 = iucn_forest_lvl2.selfMask();
// -------------  //
print('Processing savanna - 2');
if(calculate_pnv)
{ // Reset tree cover mask for Savanna mapping
  treecovermask = ee.Image.constant(0).rename('treecovermask');
}
var iucn_savanna_lvl1 = LC.expression('b(0) == 20 || b(0) == 30 || (b(0) >= 121 && b(0) <= 126)').rename('savanna');
iucn_savanna_lvl1 = iucn_savanna_lvl1.addBands(koeppen)
  .addBands(subtropics.unmask().add(1).rename("subtropics"))
  .addBands(LC.rename('LC'))
  .addBands(biomes)
  .addBands(ee.Image.pixelLonLat()).addBands(treecovermask);

var iucn_savanna_lvl1 = iucn_savanna_lvl1.expression(
    "((savanna == 1 && koeppen == 3) && treecovermask < 50 ) ? 200" + // Broad Savanna class
    ": (savanna == 1 && ((subtropics == 2 && (koeppen == 6 || koeppen == 11 || koeppen == 14)) && treecovermask < 50)) ? 200" + // Broad Savanna class
    ": (savanna == 1 && koeppen == 6 && treecovermask < 50) ? 200" + // Default Savanna
    ": ((LC == 90 && biome == 9) && treecovermask < 50) ? 200 " +// Flooded grassland biome as special case for moist savannas
    ": 0",{ 
      'treecovermask' : iucn_savanna_lvl1.select('treecovermask'),
      'savanna': iucn_savanna_lvl1.select('savanna'),
      'LC': iucn_savanna_lvl1.select('LC'),
      'biome': iucn_savanna_lvl1.select('biomes'),
      'subtropics' : iucn_savanna_lvl1.select('subtropics'),
      'latitude': iucn_savanna_lvl1.select('latitude'),
      'koeppen': iucn_savanna_lvl1.select('koeppen')
}).rename('comp');
// Mask out land area
iucn_savanna_lvl1 = iucn_savanna_lvl1.selfMask();
// Map out anything that is artifical
iucn_savanna_lvl1 = iucn_savanna_lvl1.updateMask(iucn_artific.expression('(b(0) == 0)'));

// ----------------
// Level 2 savanna
var iucn_savanna_lvl2 = iucn_savanna_lvl1.rename('savanna');
iucn_savanna_lvl2 = iucn_savanna_lvl2
.addBands(koeppen)
.addBands(LC.rename('LC'))
.addBands(biomes);
  
iucn_savanna_lvl2 = iucn_savanna_lvl2.expression(
    "((savanna == 200 && LC == 90) && biome == 9) ? 202" + // 2.2. Savanna - Moist (special case for paternal)
    ": (savanna == 200 && ((koeppen == 3 || koeppen == 4 || koeppen == 6) )   ) ? 201" + // 2.1. Savanna - Dry
    ": (savanna == 200 && ((koeppen == 11 || koeppen == 14) || ((koeppen == 3 || koeppen == 6) && biome == 9 ) ) ) ? 202" + // 2.2. Savanna - Moist
    ": savanna == 200 ? 200" + 
    ": 0",{ // Default Savanna
      'savanna': iucn_savanna_lvl2.select('savanna'),
      'LC': iucn_savanna_lvl2.select('LC'),
      'biome' : iucn_savanna_lvl2.select('biomes'),
      'koeppen': iucn_savanna_lvl2.select('koeppen')
}).rename('comp');
// Mask out land area
iucn_savanna_lvl2 = iucn_savanna_lvl2.selfMask();

// -------------  //
print('Processing Shrubland - 3');
var iucn_shrub_lvl1 = LC.expression('b(0) == 20 || (b(0) >= 121 && b(0) <= 126) ').rename('shrub');
iucn_shrub_lvl1 = iucn_shrub_lvl1.addBands(koeppen.rename('koeppen'))
.addBands(iucn_artific.rename("artific")).addBands(iucn_savanna_lvl1.rename('savanna')).addBands(treecovermask);

iucn_shrub_lvl1 = iucn_shrub_lvl1.expression(
  "(shrub == 1 && savanna == 0) ? 300" + // 3. Shrubland
  ": (shrub == 1 && treecovermask < 50) ? 300" +
  ": 0",{ 
    'treecovermask' : iucn_shrub_lvl1.select('treecovermask'),
    'savanna' : iucn_shrub_lvl1.select('savanna').unmask().expression("b(0) > 0"), // To remove savanna's
    'shrub': iucn_shrub_lvl1.select('shrub'),
    'koeppen': iucn_shrub_lvl1.select('koeppen')
}).rename('comp');
// Mask out land area
iucn_shrub_lvl1 = iucn_shrub_lvl1.selfMask();
// Map out anything that is artifical
iucn_shrub_lvl1 = iucn_shrub_lvl1.updateMask(iucn_artific.expression('(b(0) == 0)'));

// ------------------- 
var iucn_shrub_lvl2 = iucn_shrub_lvl1.rename('shrub');
iucn_shrub_lvl2 = iucn_shrub_lvl2.addBands(koeppen.rename('koeppen'))
.addBands(mountains).addBands(ee.Image.pixelLonLat())
.addBands(biomes)
.addBands(alpineBiomes.rename('alpine_abovetreelines')) // Alpine regions above the tree line
.addBands(subtropics.unmask().add(1).rename("subtropics"))
.addBands(elev_products.select('elevation'));

var iucn_shrub_lvl2 = iucn_shrub_lvl2.expression(
    "( ((shrub == 300 && mountains == 1 && subtropics == 2) || (shrub == 300 && alpine_abovetreelines == 1 && subtropics == 2)) && ((koeppen >=1 && koeppen < 3) || ((koeppen >= 9 && koeppen <= 12 || (koeppen == 15 || koeppen >= 29 ) || (biome == 10) || (biome == 1 && koeppen >=22) ) && elevation >= 1200 )) ) ? 307" + // 3.7. Shrubland – Subtropical/tropical high altitude
    ": (shrub == 300 && ((koeppen >=8 && koeppen <= 10) && (subtropics == 1 && biome == 12)) ) ? 308" + // 3.8. Shrubland – Mediterranean-type shrubby vegetation
    ": (shrub == 300 && (biome == 11 && koeppen == 30)) ? 301" + // 3.1. Shrubland – Subarctic
    ": (shrub == 300 && (latitude > 45 && ((koeppen >= 27 && koeppen <= 29) || (koeppen >= 19 && koeppen <= 20) || (koeppen >= 23 && koeppen <= 24) || (biome == 6 && koeppen == 7) )) ) ? 303" + // 3.3. Shrubland – Boreal
    ": (shrub == 300 && ((latitude < 0 && subtropics == 1) && (koeppen == 16 || (koeppen >= 29 && koeppen <= 30 )) ) ) ? 302" + // 3.2. Shrubland – Subantarctic
    ": (shrub == 300 && ((koeppen >= 3 && koeppen <= 7) || (koeppen == 7 && subtropics == 2 ) || (biome >= 2 && biome <= 3) || ( biome == 7 ) )  ) ? 305" + // 3.5. Shrubland – Subtropical/tropical dry
    ": ((shrub == 300 && subtropics == 1) && ((koeppen >=8 && koeppen <= 10) || (koeppen >= 12 && koeppen <= 19) || (koeppen >= 21 && koeppen <= 26) || (((biome >= 4 && biome <= 5) || biome == 8 || biome == 10 ) && koeppen >= 27) )) ? 304" + // 3.4. Shrubland – Temperate
    ": (shrub == 300 && ((koeppen == 1 || koeppen == 2) || (koeppen >= 11 && koeppen <= 12) || ((koeppen >= 14 && koeppen <= 15) && subtropics == 2) ) ) ? 306" + // 3.6. Shrubland – Subtropical/tropical moist
    ": shrub == 300 ? 300" +  // Higher class
    ": 0",{ 
      'shrub': iucn_shrub_lvl2.select('shrub'),
      'biome' : iucn_shrub_lvl2.select('biomes'),
      'koeppen': iucn_shrub_lvl2.select('koeppen'),
      'alpine_abovetreelines' : iucn_shrub_lvl2.select('alpine_abovetreelines').unmask(),
      'mountains': iucn_shrub_lvl2.select('mountains').expression('b(0) >= 1'),
      'elevation': iucn_shrub_lvl2.select('elevation'),
      'subtropics': iucn_shrub_lvl2.select('subtropics'),
      'latitude': iucn_shrub_lvl2.select('latitude')
}).rename('comp');
// Mask out land area
iucn_shrub_lvl2 = iucn_shrub_lvl2.selfMask();

// -------------  //
print('Processing Grassland - 4');
var iucn_grass_lvl1 = LC.expression('b(0) == 30').rename('grass');
if(calculate_pnv){
  var pasture = ee.Image.constant(0).rename('pasture'); // Empty since we don't artifical land cover for PNV
  iucn_grass_lvl1 = LC.expression('b(0) == 30 || b(0) == 21').rename('grass');
}
iucn_grass_lvl1 = iucn_grass_lvl1.addBands(pasture)
.addBands(iucn_desert_lvl1.rename("desert"))
.addBands(LC.rename("LC"))
.addBands(iucn_artific.rename("artific")).addBands(koeppen);

var iucn_grass_lvl1 = iucn_grass_lvl1.expression(
  // After 003. Removed '&& koeppen != 3' from here
    "((grass == 1 ) && pasture == 0) ? 400" + // Grassland
    ": ((LC == 60 || LC == 100) && desert == 0) ? 400" + // Alternative condition
    ": 0",{ 
      'grass': iucn_grass_lvl1.select('grass'),
      'koeppen': iucn_grass_lvl1.select('koeppen'),
      'desert': iucn_grass_lvl1.unmask().select('desert'),
      'LC': iucn_grass_lvl1.select('LC'),
      'pasture': iucn_grass_lvl1.unmask().select('pasture')
}).rename('comp');
// Mask out land area
iucn_grass_lvl1 = iucn_grass_lvl1.selfMask();
// Map out anything that is artifical
iucn_grass_lvl1 = iucn_grass_lvl1.updateMask(iucn_artific.expression('(b(0) == 0)'));

// --------------- 
var iucn_grass_lvl2 = iucn_grass_lvl1.rename('grass');
iucn_grass_lvl2 = iucn_grass_lvl2.addBands(koeppen.rename('koeppen'))
.addBands(mountains).addBands(ee.Image.pixelLonLat())
.addBands(LC.rename("LC"))
.addBands(biomes)
.addBands(alpineBiomes.rename('alpine_abovetreelines')) // Alpine regions above the tree line
.addBands(subtropics.unmask().add(1).rename("subtropics"))
.addBands(elev_products.select('elevation'));

var iucn_grass_lvl2 = iucn_grass_lvl2.expression(
    "((grass == 400 && (alpine_abovetreelines == 1 || mountains == 1)) && ((koeppen >= 1 && koeppen < 3) || ((koeppen == 11 || koeppen == 12 || koeppen == 15 || (koeppen >= 29 && subtropics == 2) || biome == 10 ) && elevation >= 1200 )) )? 407" + // 4.7. Grassland – Subtropical/tropical high altitude
    ": ((grass == 400 || LC == 100) && (biome == 11 && (koeppen == 30 || (koeppen == 7 && latitude > 60) ) ) ) ? 402" + // 4.2. Grassland – Subarctic
    ": (grass == 400 && ( (koeppen >= 19 && koeppen <= 20) || (koeppen >= 23 && koeppen <= 24) || ((koeppen >= 27 && koeppen <= 30) && (biome == 6 || biome == 11 || (biome == 13 && subtropics == 1)) || (biome == 6 && koeppen == 7) ) ) ) ? 401" + // 4.1. Grassland – Tundra
    ": (grass == 400 && ((latitude < 0 && subtropics == 1) && (koeppen == 16 || (koeppen >= 29 && koeppen <= 30 )) ) ) ? 403" + // 4.3. Grassland – Subantarctic
    ": (grass == 400 && (koeppen >= 3 && koeppen <= 5) || ( biome == 7 ) ) ? 405" + // 4.5. Grassland – Subtropical/tropical dry
    ": ((grass == 400 && subtropics == 1) && ((koeppen >=7 && koeppen <= 10) || (koeppen >= 12 && koeppen <= 16) || (koeppen >= 17 && koeppen <= 18) || (koeppen >= 21 && koeppen <= 26) || ((koeppen >= 27 && (biome >= 4 && biome <= 5) || biome == 8 || biome == 10)) ) ) ? 404" + // 4.4. Grassland – Temperate
    ": (grass == 400 && ((koeppen >= 1 && koeppen <= 2) || (koeppen >= 11 && koeppen <= 12) || ((koeppen >= 14 && koeppen <= 15) && subtropics == 2) ) ) ? 406" + // 4.6. Grassland – Subtropical/tropical seasonally wet/flooded
    ": grass == 400 ? 400" + // Higher class
    ": 0",{ 
      'grass': iucn_grass_lvl2.select('grass'),
      'biome' : iucn_grass_lvl2.select('biomes'),
      'LC' : iucn_grass_lvl2.select('LC'),
      'koeppen': iucn_grass_lvl2.select('koeppen'),
      'alpine_abovetreelines' : iucn_grass_lvl2.select('alpine_abovetreelines').unmask(),
      'mountains': iucn_grass_lvl2.select('mountains').expression('b(0) >= 1'),
      'elevation': iucn_grass_lvl2.select('elevation'),
      'subtropics': iucn_grass_lvl2.select('subtropics'),      
      'latitude': iucn_grass_lvl2.select('latitude')
}).rename('comp');
// Mask out land area
iucn_grass_lvl2 = iucn_grass_lvl2.selfMask();

// -------------  //
print('Processing Wetlands - 5');
// Level 1
var iucn_wetlands_lvl1 = LC.expression('b(0) == 80 || b(0) == 90').rename('wetlands');
iucn_wetlands_lvl1 = iucn_wetlands_lvl1
.addBands(gmw_mangroves.unmask().rename('mangroves'))
.addBands(iucn_artific.rename("artific"));
iucn_wetlands_lvl1 = iucn_wetlands_lvl1.expression(
    "(wetlands == 1 && mangroves == 0) ? 500" + // 5 Wetland areas
    ": 0 ",{ 
      'mangroves': iucn_wetlands_lvl1.select('mangroves'), // To prevent mangroves being mapped as wetlands
      'wetlands': iucn_wetlands_lvl1.select('wetlands')
}).rename('comp');
// Mask out land area
iucn_wetlands_lvl1 = iucn_wetlands_lvl1.selfMask();
// Map out anything that is artifical
iucn_wetlands_lvl1 = iucn_wetlands_lvl1.updateMask(iucn_artific.expression('(b(0) == 0)'));

// -------------------
var iucn_wetlands_lvl2 = iucn_wetlands_lvl1.rename('wetlands')
.addBands(koeppen.rename('koeppen')).addBands(LC.rename('LC'))
.addBands(hydrolakes.rename('hydrolakes')) // (1=Lake, 2: Reservoir, 3: Lake Control)
.addBands(GSW.rename('GSWtransition'))
.addBands(intertidal.rename('intertidal'))
.addBands(glwd.rename('glwd')).addBands(mountains.rename('mountains'));
// https://www.worldwildlife.org/publications/global-lakes-and-wetlands-database-lakes-and-wetlands-grid-level-3
// 1 Lake | 2 Reservoir | 3 River | 4 Freshwater Marsh, Floodplain | 5 Swamp Forest, Flooded Forest 
// 6 Coastal Wetland (incl. Mangrove, Estuary, Delta, Lagoon) | 7 Pan, Brackish/Saline Wetland | 8 Bog, Fen, Mire (Peatland)
// 9 Intermittent Wetland/Lake | 10 50-100% Wetland | 11 25-50% Wetland | 12 Wetland Compex (0-25% Wetland)
var iucn_wetlands_lvl2 = iucn_wetlands_lvl2.expression(
    "(wetlands == 500 && (mountains >= 1 && mountains <= 4)) ? 511" + // 5.11. Wetlands (inland) – Alpine wetlands (inc. temporary waters from snowmelt)
    ": (LC == 80 && (glwd == 1 || hydrolakes == 1)) ? 505" + // 5.5. Wetlands (inland) – Permanent freshwater lakes (over 8 ha)
    ": (wetlands == 500 && ((hydrolakes == 1 || glwd == 9) && GSWtransition >= 4) ) ? 506" + // 5.6. Wetlands (inland) – Seasonal/intermittent freshwater lakes (over 8 ha)
    ": ((glwd == 5 && wetlands == 500) || (LC == 20 && (glwd == 10 || glwd == 11))) ? 503" + // 5.3. Wetlands (inland) – Shrub dominated wetlands
    ": (wetlands == 500 && ((glwd == 3) && GSWtransition >= 4 )) ? 502" + // 5.2. Wetlands (inland) – Seasonal/intermittent/irregular rivers/streams/creeks
    ": (LC == 80 && ((glwd == 3) && GSWtransition <= 3)) ? 501" + // 5.1. Wetlands (inland) – Permanent rivers/streams/creeks (includes waterfalls)
    ": (wetlands == 500 && ((koeppen >= 27 && koeppen <= 28) || (koeppen >= 19 && koeppen <= 20) || (koeppen >= 23 && koeppen <=24)) ) ? 510" + // 5.10. Wetlands (inland) – Tundra wetlands (inc. pools and temporary waters from snowmelt)
    ": (wetlands == 500 && ((glwd == 8 || glwd >= 10) && (intertidal == 0 && GSWtransition < 4) && (LC == 90 && glwd == 5)) ) ? 504" + // 5.4. Wetlands (inland) – Bogs, marshes, swamps, fens, peatlands
    ": (wetlands == 500 && glwd == 4) ? 507" + // 5.7. Wetlands (inland) – Permanent freshwater marshes/pools (under 8 ha)
    ": (LC == 90 && glwd == 12) ? 508" + // 5.8. Wetlands (inland) – Seasonal/intermittent freshwater marshes/pools (under 8 ha)
    //": (wetlands == 500 && (koeppen == 1 || koeppen == 2 || koeppen == 4) ) ? 509 " + // 5.9. Wetlands (inland) – Freshwater springs and oases
    // 5.12. Wetlands (inland) – Geothermal wetlands
    ": ((wetlands == 500 && intertidal == 0 && GSWtransition < 4) && (glwd == 4 || (glwd >= 9 && glwd <= 12) )) ? 513" +// 5.13. Wetlands (inland) – Permanent inland deltas
    ": (LC == 80 && glwd == 7) ? 514" +// 5.14. Wetlands (inland) – Permanent saline, brackish or alkaline lakes
    ": ((wetlands == 500 && intertidal == 1 && GSWtransition >= 4) && (glwd == 6 || (glwd >= 9 && glwd <= 12) )) ? 515" +// 5.15. Wetlands (inland) – Seasonal/intermittent saline, brackish or alkaline lakes and flats
    // 5.16. Wetlands (inland) – Permanent saline, brackish or alkaline marshes/pools
    // 5.17. Wetlands (inland) – Seasonal/intermittent saline, brackish or alkaline marshes/pools
    // 5.18. Wetlands (inland) – Karst and other subterranean hydrological systems (inland)
    ": wetlands == 500 ? 500" + // Default wetland
    ": 0 ",{ 
      'LC': iucn_wetlands_lvl2.select('LC'),
      'wetlands': iucn_wetlands_lvl2.select('wetlands'),
      'hydrolakes': iucn_wetlands_lvl2.select('hydrolakes').expression('b(0)>1'),
      'GSWtransition': iucn_wetlands_lvl2.select('GSWtransition'),
      'intertidal': iucn_wetlands_lvl2.select('intertidal').unmask(),
      'glwd': iucn_wetlands_lvl2.select('glwd').unmask(),
      'mountains': iucn_wetlands_lvl2.select('mountains'),
      'koeppen': iucn_wetlands_lvl2.select('koeppen')
}).rename('comp');
// Mask out land area
iucn_wetlands_lvl2 = iucn_wetlands_lvl2.selfMask();

// --------------------------------------------------------------- //
// Marine habitat types //
// --------------------------------------------------------------- //
// Broad Marine Regions to be used for all Marine classes
// Class 10 (Pelagic) is not mapped given that is a depth-related class (3D)
// Filled from Harris et al. and other sources
var iucn_marinesearegions = land_mask.unmask().add(1).rename('land_mask')
.addBands(marine_seabedzones.rename('marinezones'))
.addBands(ocean_bedrock.rename('bedrock'))
.addBands(land_buffered.rename('land_buffered'))
.addBands(intertidal.rename('intertidal'));
iucn_marinesearegions = iucn_marinesearegions.expression(
    "intertidal == 2 ? 1200" + // 12. Marine - Intertidal
    ": (ocean == 1 && (((bedrock >= -200 && bedrock < 0) || (marinezones == 1)) ) ) ? 900" + // 9 Marine Neritic
    ": (ocean == 1 && (marinezones > 1) ) ? 1100" + // 11 Deep Ocean Floor classes
    ": (land_buffered == 1 && (marinezones == 1 || intertidal == 1)) ? 900" + // 9 Marine Neritic buffered filler
    ": (ocean == 1 && marinezones == 0 ) ? 900" + // Dummy class for rest of ocean with mismatchesof the marinezones layer
//    ": ? 1300" + // 13. Marine -Coastal/Supratidal 
    ": 0 ",{ 
      'marinezones' :  iucn_marinesearegions.select('marinezones').unmask(),
      'intertidal' :  iucn_marinesearegions.select('intertidal').add(1),
      'land_buffered': iucn_marinesearegions.select('land_buffered'),
      'ocean': iucn_marinesearegions.select('land_mask').rename('ocean'),
      'bedrock': iucn_marinesearegions.select('bedrock')
}).rename('comp');
iucn_marinesearegions = iucn_marinesearegions.selfMask();
Map.addLayer(iucn_marinesearegions.randomVisualizer(),{},'Broad Ocean regions',0);

// --------- Marine Neritic ---------- //
print('Processing Marine - neritic');

// Level 1
var iucn_marineneritic_lvl1 = land_mask.add(1).rename('land_mask')
.addBands(iucn_marinesearegions.rename('neritic'))
.addBands(ocean_bedrock.rename('bedrock'))
.addBands(marine_seabedzones.rename('marinezones'));
iucn_marineneritic_lvl1 = iucn_marineneritic_lvl1.expression(
    "neritic == 900 ? 900" + // 9 Marine Neritic
    ": 0 ",{ 
      'neritic' :  iucn_marineneritic_lvl1.select('neritic'),
      'marinezones' :  iucn_marineneritic_lvl1.select('marinezones'),
      'bedrock': iucn_marineneritic_lvl1.select('bedrock'),
      'ocean': iucn_marineneritic_lvl1.select('land_mask')
}).rename('comp');
iucn_marineneritic_lvl1 = iucn_marineneritic_lvl1.selfMask();

// Level 2
var iucn_marineneritic_lvl2 = iucn_marineneritic_lvl1.rename('marine_neritic')
.addBands(coral_reefs.rename('coral_reefs'))
.addBands(seagrass.rename('seagrass'))
.addBands(mangrove_buffered.rename('mangrove_buffered'))
.addBands(ocean_bedrock.rename('ocean_bedrock'));

iucn_marineneritic_lvl2 = iucn_marineneritic_lvl2.expression(
    "(marine_neritic == 900 && coral_reefs == 1 ) ? 908" + // 9.8 Coral Reefs
//    ": (marine_neritic == 900 ) ? 900" + // 9.7 Marcoalgal/Kelp
    ": ((marine_neritic == 900 ) && (seagrass == 1 && ocean_bedrock > -60) ) ? 909" + // 9.9 Seagrass (submerged)
//    "(marine_neritic == 900 ) ? 910" + // 9.10 Estuaries
//    ": (marine_neritic == 900) ? 901" + // 9.1 Pelagic. Not mapped unless there are unclassified grid cells
    ": (marine_neritic == 900 ) ? 900" + // 9 Pelagic. Dummy class
    ": 0 ",{ // Only assign 0 to non-mapped ocean classes
      'marine_neritic': iucn_marineneritic_lvl2.select('marine_neritic'),
      'coral_reefs': iucn_marineneritic_lvl2.select('coral_reefs'),      
      'seagrass': iucn_marineneritic_lvl2.select('seagrass'),   
      'mangrove_buffered': iucn_marineneritic_lvl2.select('mangrove_buffered').unmask().add(1),   
      'ocean_bedrock': iucn_marineneritic_lvl2.select('ocean_bedrock')
}).rename('comp');
iucn_marineneritic_lvl2 = iucn_marineneritic_lvl2.selfMask();
//Map.addLayer(iucn_marineneritic_lvl2.randomVisualizer(),{},"Marine neritic");

// --------- Marine Oceanic ---------- //
// FIXME: This maps additively not exclusively. E.g. Zone 1002 has at least also 1001
// Created and exported during Fractional aggregation!

print('Processing Marine Oceanic zones');
// Build class 10 as base filler for all non-identified habitat types 
// Pelagic habitat is deeper than and beyond the continental or island shelf
var iucn_marineoceanic_lvl1 = land_mask.add(1).rename('land_mask')
.addBands(marine_seabedzones.rename('marinezones'));
iucn_marineoceanic_lvl1 = iucn_marineoceanic_lvl1.expression(
    "(ocean == 1 && marinezones > 1) ? 1000" + // 10 Marine Ocean
    ": 0 ",{ 
      'marinezones' :  iucn_marineoceanic_lvl1.select('marinezones'),
      'ocean': iucn_marineoceanic_lvl1.select('land_mask').expression('b(0) == 1')
}).rename('comp');
iucn_marineoceanic_lvl1 = iucn_marineoceanic_lvl1.selfMask();

// Level 2
var iucn_marineoceanic_lvl2 = iucn_marineoceanic_lvl1.rename('oceanic')
.addBands(ocean_bedrock.rename('ocean_bedrock'));
iucn_marineoceanic_lvl2 = iucn_marineoceanic_lvl2.expression(
    "(oceanic == 1000 && ocean_bedrock <= -4000 ) ? 1004" + // 10.4 Abyssopelagic (4,000–6,000 m)
    ": (oceanic == 1000 && ocean_bedrock <= -1000 ) ? 1003" + // 10.3 Bathypelagic (1,000–4,000 m)
    ": (oceanic == 1000 && ocean_bedrock < -200 ) ? 1002" + // 10.2 Mesopelagic (200–1,000 m)
    ": (oceanic == 1000 && ocean_bedrock < 0) ) ? 1001" + // 10.1 Epipelagic (0–200 m)
    ": 0 ",{ // Only assign 0 to non-mapped ocean classes
      'oceanic': iucn_marineoceanic_lvl2.select('oceanic'),
      'ocean_bedrock': iucn_marineoceanic_lvl2.select('ocean_bedrock')
}).rename('comp');
iucn_marineoceanic_lvl2 = iucn_marineoceanic_lvl2.selfMask(); // Self maks

// --------- Marine Deep Ocean Floor (Benthis and Demersal ---------- //
print('Processing Marine Deep Ocean Floor zones');
// Level 1 (Take from marine sea regions)
var iucn_marinedeepocean_lvl1 = iucn_marinesearegions.expression('b(0) == 1100').multiply(1100).selfMask();

// Level 2
var iucn_marinedeepocean_lvl2 = iucn_marinedeepocean_lvl1.rename('deepocean')
.addBands(marine_seabedzones.rename('marinezones'))
.addBands(ocean_bedrock.rename('bedrock'))
.addBands(seamounts.rename('seamounts'))
.addBands(vents.rename('vents'))
.addBands(abyss_class.rename('abyss_class'));
iucn_marinedeepocean_lvl2 = iucn_marinedeepocean_lvl2.expression(
  "(deepocean == 1100 && vents == 1) ? 1106" + // 11.6 Deep Sea Vents (Rifts/Seeps)
  ": (deepocean == 1100 && seamounts == 1) ? 1105" + // 11.5 Sea mount
  ": (marinezones == 2 ) ? 1101" + // 11.1 Continental Slope / Bathyl zone (200-4000m)
  ": (marinezones == 3 && (abyss_class == 1 || abyss_class == 2 )) ? 1102" + // 11.2 Abyssal Plain (4000m to 6000m)
  ": (marinezones == 3 && abyss_class > 2  ) ? 1103" + // 11.3 Abyssal Mountain/Hills (4000m to 6000m)
  ": (marinezones == 4 ) ? 1104" + // 11.4 Hadal/Deep Sea Trench
  ": 0",{
    'deepocean' : iucn_marinedeepocean_lvl2.select('deepocean'),
    'abyss_class' : iucn_marinedeepocean_lvl2.select('abyss_class'),
    'marinezones' :  iucn_marinedeepocean_lvl2.select('marinezones'),
    'seamounts' : iucn_marinedeepocean_lvl2.select('seamounts'),
    'vents' : iucn_marinedeepocean_lvl2.select('vents'),
    'ocean_bedrock': iucn_marinedeepocean_lvl2.select('bedrock')
  }).rename('comp');
iucn_marinedeepocean_lvl2 = iucn_marinedeepocean_lvl2.selfMask();

// --------- Marine - Intertidal ---------- //
print('Processing Marine Intertidal zones');
// Level 1 (Take from marine sea regions)
var iucn_marineintertidal_lvl1 = land_mask.add(1).rename('land_mask')
.addBands(iucn_marinesearegions.expression('b(0) == 1200').selfMask().rename('intertidal'));
iucn_marineintertidal_lvl1 = iucn_marineintertidal_lvl1.expression(
    "(ocean == 1 && intertidal == 1) ? 1200" + // 12 Intertidal. Area on the shore that is frequently covered by tides
    ": 0 ",{ 
      'intertidal' :  iucn_marineintertidal_lvl1.select('intertidal'),
      'ocean': iucn_marineintertidal_lvl1.select('land_mask').expression('b(0) == 1')
}).rename('comp');
iucn_marineintertidal_lvl1 = iucn_marineintertidal_lvl1.selfMask();

// Level 2
var iucn_marineintertidal_lvl2 = iucn_marineintertidal_lvl1.rename('intertidal')
.addBands(marine_seabedzones.rename('marinezones'))
.addBands(mangrove_buffered.rename('mangroves_buffered'))
.addBands(GSW.rename('GSWtransition'));
iucn_marineintertidal_lvl2 = iucn_marineintertidal_lvl2.expression(
  "(intertidal == 1200 && mangroves_buffered == 1) ? 1207" + // 12.7 Mangrove Submerged Roots
  ": (intertidal == 1200 && (GSWtransition == 9 || GSWtransition == 10 || GSWtransition == 4) ) ? 1206" + // 12.6 Tidepools
// Salt Marshes!
// Sand and Pebble Beaches
  ": intertidal == 1200 ? 1200" + // 1200 Map by default to Oceanic intertidal zone
  ": 0",{
    'intertidal' : iucn_marineintertidal_lvl2.select('intertidal'),
    'marinezones' : iucn_marineintertidal_lvl2.select('marinezones'),
    'mangroves_buffered' : iucn_marineintertidal_lvl2.select('mangroves_buffered'),
    'GSWtransition': iucn_marineintertidal_lvl2.select('GSWtransition')
  }).rename('comp');
iucn_marineintertidal_lvl2 = iucn_marineintertidal_lvl2.selfMask();
//Map.addLayer(iucn_marineintertidal_lvl2.randomVisualizer());

// #################################################################### //
// Compositing
print('| Composite all layers together |');

// Use mode compositer
if(level == 1){
  // Construct marine and reduce first
  var marine = ee.ImageCollection([ iucn_marineneritic_lvl1.toInt16(),iucn_marinedeepocean_lvl1.toInt16(),iucn_marineintertidal_lvl1.toInt16(),
  land_buffered.multiply(900).rename('comp').toInt16()]);
  marine = marine.reduce(ee.Reducer.firstNonNull()).rename('comp');
  
  // new Artifical 
  var art_lvl1 = iucn_artific.expression('b(0)>=1400 & b(0) <= 1408').multiply(1400);
  art_lvl1 = art_lvl1.toInt16().selfMask();
  
  if(calculate_pnv){
    var ll = [iucn_forest_lvl1.toInt16(),iucn_savanna_lvl1.toInt16(),iucn_shrub_lvl1.toInt16(),iucn_grass_lvl1.toInt16(),iucn_desert_lvl1.toInt16(),iucn_wetlands_lvl1.toInt16(),
    marine];
  } else {
    var ll = [iucn_forest_lvl1.toInt16(),iucn_savanna_lvl1.toInt16(),iucn_shrub_lvl1.toInt16(),iucn_grass_lvl1.toInt16(),iucn_desert_lvl1.toInt16(),iucn_wetlands_lvl1.toInt16(),
    art_lvl1,
    marine];
  }
} else {
  // Construct marine and reduce first
  var marine = ee.ImageCollection([ iucn_marineneritic_lvl2.toInt16(),iucn_marinedeepocean_lvl2.toInt16(),iucn_marineintertidal_lvl2.toInt16(),
  land_buffered.multiply(900).rename('comp').toInt16()]);
  marine = marine.reduce(ee.Reducer.firstNonNull()).rename('comp');

  if(calculate_pnv){
    var ll = [iucn_forest_lvl2.toInt16(),iucn_savanna_lvl2.toInt16(),iucn_shrub_lvl2.toInt16(),iucn_grass_lvl2.toInt16(),iucn_desert_lvl2.toInt16(),iucn_wetlands_lvl2.toInt16(),
    marine];
  } else {
    var ll = [iucn_forest_lvl2.toInt16(),iucn_savanna_lvl2.toInt16(),iucn_shrub_lvl2.toInt16(),iucn_grass_lvl2.toInt16(),iucn_desert_lvl2.toInt16(),iucn_wetlands_lvl2.toInt16(),
    iucn_artific.selfMask().toInt16(), // Self mask the artifical layer
    marine];
  }
}
var comp = ee.ImageCollection(ll);
// Composite output layers and class checks
var missing = comp.reduce(ee.Reducer.anyNonZero()).where(0,1);
var duplicates = comp.reduce(ee.Reducer.countDistinct());

// Composite to first class being mapped for a given level and clip
comp = comp.reduce(ee.Reducer.firstNonNull()).selfMask();

// Caspian sea fix
if(level == 1){
  comp = comp.where(kaspian_seafix_image,ee.Image(500));
} else {
  comp = comp.where(kaspian_seafix_image,ee.Image(505));
}

// Classes that only got mapped to level 1 at level 2
if(level == 2){
  var level1_only = comp.expression('(b(0) == 100) || (b(0) == 200) || (b(0) == 300) || (b(0) == 400) || (b(0) == 500) || (b(0) == 1400)');
  Map.addLayer(level1_only.selfMask().randomVisualizer(),{},'Level 2 only at level 1', 0);
}

// #################################################################### //
// Exporting functions
if(level == 1){
  iucn_artific = iucn_artific.selfMask().expression('(b(0) > 0)').where(1,1400);
  if(export_classes){
    // Export individual layers
    createOutput(iucn_desert_lvl1,output_path, 'iucn_6and8_rockydeserts_lvl'+level);
    createOutput(iucn_artific,output_path, 'iucn_14_artifical_lvl'+level);
    createOutput(iucn_forest_lvl1,output_path, 'iucn_1_forests_lvl'+level);
    createOutput(iucn_savanna_lvl1,output_path, 'iucn_2_savanna_lvl'+level);
    createOutput(iucn_shrub_lvl1,output_path,'iucn_3_shrub_lvl'+level);
    createOutput(iucn_grass_lvl1,output_path,'iucn_4_grass_lvl'+level);
    createOutput(iucn_wetlands_lvl1,output_path,'iucn_5_wetland_lvl'+level);
    // Marine
    createOutput(iucn_marineneritic_lvl1,output_path,'iucn_9_neritic_lvl'+level);
    createOutput(iucn_marineoceanic_lvl1,output_path,'iucn_10_pelagic_lvl'+level);
    createOutput(iucn_marinedeepocean_lvl1,output_path,'iucn_11_deepocean_lvl'+level);
    createOutput(iucn_marineintertidal_lvl1,output_path,'iucn_12_intertidal_lvl'+level);
  }
} else {
  if(export_classes){
    // Export individual layers
    createOutput(iucn_desert_lvl2,output_path,'iucn_6and8_rockydeserts_lvl'+level);
    createOutput(iucn_artific,output_path,'iucn_14_artifical_lvl'+level);
    createOutput(iucn_forest_lvl2,output_path,'iucn_1_forests_lvl'+level);
    createOutput(iucn_savanna_lvl2,output_path,'iucn_2_savanna_lvl'+level);
    createOutput(iucn_shrub_lvl2,output_path,'iucn_3_shrub_lvl'+level);
    createOutput(iucn_grass_lvl2,output_path,'iucn_4_grass_lvl'+level);
    createOutput(iucn_wetlands_lvl2,output_path,'iucn_5_wetland_lvl'+level);
    // Marine
    createOutput(iucn_marineneritic_lvl2,output_path,'iucn_9_neritic_lvl'+level);
    createOutput(iucn_marineoceanic_lvl2,output_path,'iucn_10_pelagic_lvl'+level);
    createOutput(iucn_marinedeepocean_lvl2,output_path,'iucn_11_deepocean_lvl'+level);
    createOutput(iucn_marineintertidal_lvl2,output_path,'iucn_12_intertidal_lvl'+level);
  }
}
// If the year is after 2015, mask the composite layer to only those grid cells with recorded change
if(year > 2015){
  // Mask composite with changemask for the current year
  comp = comp.mask(changemask).rename('comp' + year);
  // Process differently for each year
  if(year == 2016){
    // For year 2016, take 2015 full asset and update with change mask
    try{
      var comp2015 = ee.Image( 'users/Uploads/habitattypes/iucn_habitatclassification_composite_lvl' + level + "_ver" + version );
      var comp_before = comp2015.mask(changemask).rename('comp2015');
    } catch(err) {
      print('Composited map for ', year -1,' not available yet as asset. Run first!');
    }
  }
  if(year == 2017){
    try{
    // Build previous years
      var comp2015 = ee.Image('users/Uploads/habitattypes/iucn_habitatclassification_composite_lvl' + level+"_ver" + version );
      var change2016 = ee.Image('users/Uploads/habitattypes/changemasks2016/iucn_habitatclassification_2016changemask_lvl' + level+"_ver" + version);
      // Create 2016 composite
      change2016 = change2016.select(['comp2016']);
      var comp2016 = updateComposite(comp2015,change2016); 
      // Now create 2016 before change
      var comp_before = comp2016.mask(changemask).rename('comp2016');
    } catch(err) {
      print('Composited map for ', year -1,' not available yet as asset. Run first!');
    }
  }
  if(year == 2018){
   try{
      // Build previous years
      var comp2015 = ee.Image('users/Uploads/habitattypes/iucn_habitatclassification_composite_lvl' + level+"_ver" + version );
      var change2016 = ee.Image('users/Uploads/habitattypes/changemasks2016/iucn_habitatclassification_2016changemask_lvl' + level+"_ver" + version);
      var change2017 = ee.Image('users/Uploads/habitattypes/changemasks2017/iucn_habitatclassification_2017changemask_lvl' + level+"_ver" + version);
      // Create 2017 composite
      change2016 = change2016.select(['comp2016']);
      change2017 = change2017.select(['comp2017']);
      var comp2016 = updateComposite(comp2015,change2016);
      var comp2017 = updateComposite(comp2016,change2017);
      // Now create 2018 before change
      var comp_before = comp2017.mask(changemask).rename('comp2017');
    } catch(err) {
      print('Composited map for ', year -1,' not available yet as asset. Run first!');
    }
  }
  if(year == 2019){
    try{
      // Build previous years
      var comp2015 = ee.Image('users/Uploads/habitattypes/iucn_habitatclassification_composite_lvl' + level+"_ver" + version );
      var change2016 = ee.Image('users/Uploads/habitattypes/changemasks2016/iucn_habitatclassification_2016changemask_lvl' + level+"_ver" + version);
      var change2017 = ee.Image('users/Uploads/habitattypes/changemasks2017/iucn_habitatclassification_2017changemask_lvl' + level+"_ver" + version);
      var change2018 = ee.Image('users/Uploads/habitattypes/changemasks2018/iucn_habitatclassification_2018changemask_lvl' + level+"_ver" + version);
      // Create 2018 composite
      change2016 = change2016.select(['comp2016']);
      change2017 = change2017.select(['comp2017']);
      change2018 = change2018.select(['comp2018']);
      var comp2016 = updateComposite(comp2015,change2016);
      var comp2017 = updateComposite(comp2016,change2017);
      var comp2018 = updateComposite(comp2017,change2018);
      // Now create 2019 before change
      var comp_before = comp2018.mask(changemask).rename('comp2018');
    } catch(err) {
      print('Composited map for ', year -1,' not available yet as asset. Run first!');
    }
  }
  // --------------------------------- //
  // Now add together as bands
  comp = comp_before.addBands(comp);
  
  // Now export this version
  if(calculate_pnv){print('Years after 2015 not implemented yet');}
  // Export the change mask
  var name = 'iucn_habitatclassification_' + year + 'changemask_lvl' + level + "_ver" + version;
  createOutput(comp,output_path + '/' + 'changemasks' + year + '/' + name, name);
  
} else {
  // Export
  if(calculate_pnv){
    createOutput(comp,output_path + '/' + 'iucn_habitatclassification_composite_pnv_lvl'+level+"_ver"+version,
    'iucn_habitatclassification_composite_pnv_lvl'+level+"_ver"+version);
  //  createOutput(missing,'iucn_habitatclassification_nonmissing_pnv_lvl'+level+"_ver"+version);
  //  createOutput(duplicates,'iucn_habitatclassification_duplicates_pnv_lvl'+level+"_ver"+version);
  } else {
    createOutput(comp,output_path + '/' + 'iucn_habitatclassification_composite_lvl'+level+"_ver"+version, 
    'iucn_habitatclassification_composite_lvl'+level+"_ver"+version);
  //  createOutput(missing,'iucn_habitatclassification_nonmissing_lvl'+level+"_ver"+version);
  //  createOutput(duplicates,'iucn_habitatclassification_duplicates_lvl'+level+"_ver"+version);
  }
}
// #################################################################### //
// Visualization options for the colour map///
// Define colours
var colours_level2 = 
'<RasterSymbolizer>' +
 '<ColorMap  type="intervals" extended="false" >' +
    '<ColorMapEntry color="#002de1" quantity="0" label="Water"/>' +
    
    '<ColorMapEntry color="#0a941c" quantity="100" label="Forest"/>' +
    '<ColorMapEntry color="#115e4e" quantity="101" label="Forest - Boreal"/>' +
    '<ColorMapEntry color="#07a187" quantity="102" label="Forest - Subarctic"/>' +
    '<ColorMapEntry color="#00fac0" quantity="103" label="Forest - Subantarctic"/>' +
    '<ColorMapEntry color="#27a170" quantity="104" label="Forest - Temperate"/>' +
    '<ColorMapEntry color="#9df941" quantity="105" label="Forest - Subtropical-tropical dry"/>' +
    '<ColorMapEntry color="#2af434" quantity="106" label="Forest - Subtropical-tropical moist lowland"/>' +
    '<ColorMapEntry color="#a0fecc" quantity="107" label="Forest - Subtropical-tropical mangrove vegetation"/>' +
    '<ColorMapEntry color="#677e2d" quantity="108" label="Forest - Subtropical-tropical swamp"/>' +
    '<ColorMapEntry color="#00c410" quantity="109" label="Forest - Subtropical-tropical moist montane"/>' +
    
    '<ColorMapEntry color="#c6ff53" quantity="200" label="Savanna"/>' +
    '<ColorMapEntry color="#f5e936" quantity="201" label="Savanna - Dry"/>' +
    '<ColorMapEntry color="#cdff27" quantity="202" label="Savanna - Moist"/>' +
    
    '<ColorMapEntry color="#eaa03f" quantity="300" label="Shrubland"/>' +
    '<ColorMapEntry color="#645800" quantity="301" label="Shrubland - Subarctic"/>' +
    '<ColorMapEntry color="#7b7a60" quantity="302" label="Shrubland - Subantarctic"/>' +
    '<ColorMapEntry color="#84a79b" quantity="303" label="Shrubland - Boreal"/>' +
    '<ColorMapEntry color="#9addd4" quantity="304" label="Shrubland - Temperate"/>' +
    '<ColorMapEntry color="#ffe97b" quantity="305" label="Shrubland - Subtropical-tropical dry"/>' +
    '<ColorMapEntry color="#f0a625" quantity="306" label="Shrubland - Subtropical-tropical moist"/>' +
    '<ColorMapEntry color="#ce9bc2" quantity="307" label="Shrubland - Subtropical-tropical high altitude"/>' +
    '<ColorMapEntry color="#7f1dd5" quantity="308" label="Shrubland - Mediterranean-type"/>' +
    
    '<ColorMapEntry color="#98fae7" quantity="400" label="Grassland"/>' +
    '<ColorMapEntry color="#bdeed8" quantity="401" label="Grassland - Tundra"/>' +
    '<ColorMapEntry color="#adc4c0" quantity="402" label="Grassland - Subarctic"/>' +
    '<ColorMapEntry color="#264758" quantity="403" label="Grassland - Subantarctic"/>' +
    '<ColorMapEntry color="#33b988" quantity="404" label="Grassland - Temperate"/>' +
    '<ColorMapEntry color="#fff5cb" quantity="405" label="Grassland - Subtropical-tropical dry"/>' +
    '<ColorMapEntry color="#89e8f0" quantity="406" label="Grassland - Subtropical-tropical seasonally wet or flooded"/>' +
    '<ColorMapEntry color="#facbff" quantity="407" label="Grassland - Subtropical-tropical high altitude"/>' +
    
    '<ColorMapEntry color="#5bb5ff" quantity="500" label="Wetlands (inland)"/>' +
    '<ColorMapEntry color="#00fafa" quantity="501" label="Wetlands (inland) - Permanent rivers streams creeks"/>' +
    '<ColorMapEntry color="#d6a0f9" quantity="502" label="Wetlands (inland) - Seasonal/intermittent/irregular rivers/streams/creeks"/>' +
    '<ColorMapEntry color="#bf2ae8" quantity="503" label="Wetlands (inland) - Shrub dominated wetlands"/>' +
    '<ColorMapEntry color="#314872" quantity="504" label="Wetlands (inland) - Bogs/marshes/swamps/fens/peatlands"/>' +
    '<ColorMapEntry color="#0e77d9" quantity="505" label="Wetlands (inland) - Permanent freshwater lakes"/>' +
    '<ColorMapEntry color="#6e96c4" quantity="506" label="Wetlands (inland) - Seasonal/intermittent freshwater lakes (over 8 ha)"/>' +
    '<ColorMapEntry color="#00add8" quantity="507" label="Wetlands (inland) - Permanent freshwater marshes/pools (under 8 ha)"/>' +
    '<ColorMapEntry color="#218ed6" quantity="508" label="Wetlands (inland) - Seasonal/intermittent freshwater marshes/pools (under 8 ha)"/>' +
    '<ColorMapEntry color="#301f99" quantity="509" label="Wetlands (inland) - Freshwater springs and oases"/>' +
    '<ColorMapEntry color="#a1e6ec" quantity="510" label="Wetlands (inland) - Tundra wetlands"/>' +
    '<ColorMapEntry color="#c7e1e4" quantity="511" label="Wetlands (inland) - Alpine wetlands"/>' +
    '<ColorMapEntry color="#f9e9d4" quantity="512" label="Wetlands (inland) - Geothermal wetlands"/>' +
    '<ColorMapEntry color="#0025fc" quantity="513" label="Wetlands (inland) - Permanent inland deltas"/>' +
    '<ColorMapEntry color="#166b95" quantity="514" label="Wetlands (inland) - Permanent saline brackish or alkaline lakes"/>' +
    '<ColorMapEntry color="#46a4c0" quantity="515" label="Wetlands (inland) - Seasonal/intermittent saline brackish or alkaline lakes and flats"/>' +
    '<ColorMapEntry color="#3e71e0" quantity="516" label="Wetlands (inland) - Permanent /saline / brackish or alkaline marshes/pools"/>' +
    '<ColorMapEntry color="#9c75d0" quantity="517" label="Wetlands (inland) - Seasonal/intermittent /saline / brackish or alkaline marshes/pools"/>' +
    '<ColorMapEntry color="#ff01bc" quantity="518" label="Wetlands (inland) / Karst and other subterranean hydrological systems"/>' +

    '<ColorMapEntry color="#a59283" quantity="600" label="Rocky Areas"/>' +
    '<ColorMapEntry color="#fffce1" quantity="800" label="Desert"/>' +
    '<ColorMapEntry color="#ffb701" quantity="801" label="Desert - Hot"/>' +
    '<ColorMapEntry color="#e4e9d4" quantity="802" label="Desert - Temperate"/>' +
    '<ColorMapEntry color="#daedf5" quantity="803" label="Desert - Cold"/>' +

    '<ColorMapEntry color="#99ddf7" quantity="900" label="Marine - Neritic"/>' +
    '<ColorMapEntry color="#d1ecf7" quantity="901" label="Marine - Neritic Pelagic"/>' +
    '<ColorMapEntry color="#fd7c6e" quantity="908" label="Marine - Coral Reefs"/>' +
    '<ColorMapEntry color="#86a475" quantity="909" label="Marine - Seagrass (submerged)"/>' +
    '<ColorMapEntry color="#1da2d8" quantity="1000" label="Marine - Oceanic"/>' +
    '<ColorMapEntry color="#1781ac" quantity="1001" label="Marine - Epipelagic"/>' +
    '<ColorMapEntry color="#0e516c" quantity="1002" label="Marine - Mesopelagic"/>' +
    '<ColorMapEntry color="#083040" quantity="1003" label="Marine - Bathypelagic"/>' +
    '<ColorMapEntry color="#021015" quantity="1004" label="Marine - Abyssopelagic"/>' +
    '<ColorMapEntry color="#7fcdff" quantity="1100" label="Marine - Deep Ocean Floor"/>' +
    '<ColorMapEntry color="#1199d1" quantity="1101" label="Marine - Continental Slope/Bathyl zone"/>' +
    '<ColorMapEntry color="#60bde3" quantity="1102" label="Marine - Abyssal Plain "/>' +
    '<ColorMapEntry color="#1a91c2" quantity="1103" label="Marine - Abyssal Mountains/Hills "/>' +
    '<ColorMapEntry color="#027495" quantity="1104" label="Marine - Hadal/Deep Sea Trench "/>' +
    '<ColorMapEntry color="#6baed6" quantity="1105" label="Marine - Seamounts "/>' +
    '<ColorMapEntry color="#7F00FF" quantity="1106" label="Marine - Deep Sea Vent "/>' +
    '<ColorMapEntry color="#4ce6e6" quantity="1200" label="Marine - Intertidal"/>' +
    '<ColorMapEntry color="#3212b3" quantity="1206" label="Marine - Tidepools"/>' +
    '<ColorMapEntry color="#7cd9cc" quantity="1207" label="Marine - Mangroves submerged Roots"/>' +

    '<ColorMapEntry color="#d95049" quantity="1400" label="Artificial - Terrestrial"/>' +
    '<ColorMapEntry color="#ffa083" quantity="1401" label="Arable land"/>' +
    '<ColorMapEntry color="#ff83ca" quantity="1402" label="Pastureland"/>' +
    '<ColorMapEntry color="#FF0800" quantity="1403" label="Plantations"/>' +
    '<ColorMapEntry color="#ddcb25" quantity="1404" label="Rural Gardens"/>' +
    '<ColorMapEntry color="#000000" quantity="1405" label="Urban Areas"/>' +
    '<ColorMapEntry color="#ff1601" quantity="1406" label="Subtropical/Tropical Heavily Degraded Former Forest"/>' +

    '<ColorMapEntry color="#ffffff" quantity="1700" label="Unknown"/>' +

    '</ColorMap>' +
'</RasterSymbolizer>';    

// Visualization
if(year > 2015){
  Map.addLayer(comp.select('comp' +year), {shown:false}, 'Habitat codes year ' + year, 0);
  Map.addLayer(comp.select('comp' +year).sldStyle(colours_level2), {}, "Level " + level + ' in year '+ year,0);   // Redraw map
} else {
  Map.addLayer(comp, {shown:false}, 'Habitat codes year ' + year, 0);
  Map.addLayer(comp.sldStyle(colours_level2), {}, "Level " + level + ' in year '+ year,0);   // Redraw map
}
//Map.addLayer(LC.randomVisualizer(),{},"Land cover");
//Map.addLayer(missing.randomVisualizer(),{},"Missing", 0);
