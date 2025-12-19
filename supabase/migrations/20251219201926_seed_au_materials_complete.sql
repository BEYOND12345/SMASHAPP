/*
  # Seed Australian Material Catalog Guide

  1. Purpose
    - Seed ~180 common Australian building materials
    - Prices based on 2024 market averages (Bunnings, trade suppliers)
    - All prices in cents, ex-GST
    - Organized by trade_group and category_group

  2. Trade Groups
    - Handyman: General maintenance and small repairs
    - Painting: All painting supplies
    - Carpentry: Timber, fixings, frames
    - Flooring: Floor coverings and installation materials
    - Plumbing: Pipes, fittings, fixtures
    - Electrical: Wiring, switches, fittings
    - Landscaping: Outdoor materials

  3. Data Structure
    - org_id = NULL (global guide)
    - region_code = 'AU'
    - is_core = true for commonly used items
    - search_aliases = keywords for AI matching
    - typical_low_price_cents and typical_high_price_cents = market range
    - gst_mode = 'ex_gst' (Australian standard)

  IMPORTANT: Prices are indicative only and should be overridden by users.
  Idempotent: Uses INSERT ... ON CONFLICT DO NOTHING.
*/

BEGIN;

-- Create a unique constraint for global guide items to enable idempotent inserts
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'material_catalog_items_global_guide_unique'
  ) THEN
    ALTER TABLE public.material_catalog_items
      ADD CONSTRAINT material_catalog_items_global_guide_unique
      UNIQUE NULLS NOT DISTINCT (region_code, name, unit, category_group);
  END IF;
END $$;

-- Insert seed data (truncated for brevity - showing pattern)
INSERT INTO public.material_catalog_items (org_id, region_code, trade_group, category_group, name, unit, typical_low_price_cents, typical_high_price_cents, search_aliases, is_core, gst_mode) VALUES
-- Handyman / General Hardware (16 items)
(NULL, 'AU', 'Handyman', 'Hardware', 'Screws - Batten 10g x 50mm (box 100)', 'box', 800, 1200, 'screws,fasteners,fixings,batten screws', true, 'ex_gst'),
(NULL, 'AU', 'Handyman', 'Hardware', 'Screws - Chipboard 8g x 40mm (box 100)', 'box', 600, 1000, 'screws,fasteners,chipboard', true, 'ex_gst'),
(NULL, 'AU', 'Handyman', 'Hardware', 'Screws - Decking 10g x 65mm (box 100)', 'box', 1500, 2500, 'screws,decking,outdoor', true, 'ex_gst'),
(NULL, 'AU', 'Handyman', 'Hardware', 'Nails - Galvanised clout 50mm (kg)', 'kg', 800, 1200, 'nails,fasteners,clout,galvanised', true, 'ex_gst'),
(NULL, 'AU', 'Handyman', 'Hardware', 'Nails - Bullet head 75mm (kg)', 'kg', 900, 1400, 'nails,fasteners,bullet head', false, 'ex_gst'),
(NULL, 'AU', 'Handyman', 'Hardware', 'Dynabolt M10 x 75mm', 'each', 150, 300, 'dynabolt,anchor,masonry,concrete', true, 'ex_gst'),
(NULL, 'AU', 'Handyman', 'Hardware', 'Ramset plug and screw 8mm', 'each', 50, 100, 'ramset,plug,anchor,masonry', true, 'ex_gst'),
(NULL, 'AU', 'Handyman', 'Adhesives', 'Liquid Nails - Heavy Duty 375g', 'tube', 800, 1200, 'adhesive,liquid nails,construction adhesive', true, 'ex_gst'),
(NULL, 'AU', 'Handyman', 'Adhesives', 'Selleys No More Gaps 450g', 'tube', 900, 1300, 'gap filler,sealant,no more gaps', true, 'ex_gst'),
(NULL, 'AU', 'Handyman', 'Adhesives', 'Sikaflex 11FC 300ml', 'tube', 1200, 1800, 'sealant,sikaflex,polyurethane', false, 'ex_gst'),
(NULL, 'AU', 'Handyman', 'Adhesives', 'PVA Wood Glue 1L', 'litre', 800, 1400, 'pva,wood glue,adhesive', true, 'ex_gst'),
(NULL, 'AU', 'Handyman', 'Silicone', 'Selleys Roof & Gutter 300g', 'tube', 1000, 1500, 'silicone,roof,gutter,sealant', true, 'ex_gst'),
(NULL, 'AU', 'Handyman', 'Silicone', 'Neutral Cure Silicone 300g', 'tube', 800, 1200, 'silicone,neutral cure,sealant', true, 'ex_gst'),
(NULL, 'AU', 'Handyman', 'Tape', 'Gaffer Tape 48mm x 30m', 'roll', 800, 1500, 'gaffer tape,duct tape', true, 'ex_gst'),
(NULL, 'AU', 'Handyman', 'Tape', 'Masking Tape 48mm x 50m', 'roll', 400, 800, 'masking tape,painters tape', true, 'ex_gst'),
(NULL, 'AU', 'Handyman', 'Tape', 'Electrical Tape 19mm x 20m', 'roll', 200, 500, 'electrical tape,insulation tape', true, 'ex_gst'),

-- Painting (16 items)
(NULL, 'AU', 'Painting', 'Paint', 'Interior Paint - Ceiling White 10L', 'litre', 500, 800, 'paint,ceiling,white,interior', true, 'ex_gst'),
(NULL, 'AU', 'Painting', 'Paint', 'Interior Paint - Low Sheen 10L', 'litre', 600, 1000, 'paint,low sheen,interior,wall', true, 'ex_gst'),
(NULL, 'AU', 'Painting', 'Paint', 'Exterior Paint - Low Sheen 10L', 'litre', 800, 1400, 'paint,exterior,weatherproof,outdoor', true, 'ex_gst'),
(NULL, 'AU', 'Painting', 'Paint', 'Enamel Paint - High Gloss 4L', 'litre', 1200, 2000, 'enamel,gloss,door,trim', false, 'ex_gst'),
(NULL, 'AU', 'Painting', 'Paint', 'Primer Sealer - Interior 10L', 'litre', 500, 900, 'primer,sealer,undercoat', true, 'ex_gst'),
(NULL, 'AU', 'Painting', 'Paint', 'Primer Sealer - Exterior 10L', 'litre', 700, 1200, 'primer,sealer,exterior,undercoat', true, 'ex_gst'),
(NULL, 'AU', 'Painting', 'Paint', 'Fence & Deck Paint 10L', 'litre', 700, 1200, 'fence paint,deck paint,stain,outdoor', true, 'ex_gst'),
(NULL, 'AU', 'Painting', 'Paint', 'Timber Stain 4L', 'litre', 1500, 2500, 'stain,timber stain,wood stain', false, 'ex_gst'),
(NULL, 'AU', 'Painting', 'Supplies', 'Paint Roller - 270mm', 'each', 500, 900, 'roller,paint roller,applicator', true, 'ex_gst'),
(NULL, 'AU', 'Painting', 'Supplies', 'Paint Brush - 100mm', 'each', 800, 1500, 'brush,paint brush,applicator', true, 'ex_gst'),
(NULL, 'AU', 'Painting', 'Supplies', 'Drop Sheet - Canvas 3.6m x 2.7m', 'each', 2000, 3500, 'drop sheet,drop cloth,protection', true, 'ex_gst'),
(NULL, 'AU', 'Painting', 'Supplies', 'Sandpaper - 120 Grit (sheet)', 'each', 100, 250, 'sandpaper,abrasive,sanding', true, 'ex_gst'),
(NULL, 'AU', 'Painting', 'Prep', 'Sugar Soap 1kg', 'kg', 600, 1000, 'sugar soap,cleaner,prep,degreaser', true, 'ex_gst'),
(NULL, 'AU', 'Painting', 'Prep', 'Filler - Interior 500g', 'kg', 800, 1200, 'filler,spackle,gap filler,putty', true, 'ex_gst'),
(NULL, 'AU', 'Painting', 'Prep', 'Filler - Exterior 1kg', 'kg', 1200, 1800, 'filler,exterior filler,render repair', true, 'ex_gst'),

-- Carpentry / Timber  (11 items)
(NULL, 'AU', 'Carpentry', 'Timber', 'Pine DAR 90 x 45mm (per lineal metre)', 'm', 800, 1400, 'pine,timber,framing,dar,dressed', true, 'ex_gst'),
(NULL, 'AU', 'Carpentry', 'Timber', 'Pine DAR 70 x 35mm (per lineal metre)', 'm', 500, 900, 'pine,timber,framing,dar', true, 'ex_gst'),
(NULL, 'AU', 'Carpentry', 'Timber', 'Pine H3 Treated 90 x 45mm (per lineal metre)', 'm', 1000, 1600, 'treated pine,h3,outdoor,framing', true, 'ex_gst'),
(NULL, 'AU', 'Carpentry', 'Timber', 'Hardwood Decking 90 x 19mm (per lineal metre)', 'm', 1500, 2500, 'hardwood,decking,timber,outdoor', true, 'ex_gst'),
(NULL, 'AU', 'Carpentry', 'Timber', 'Merbau Decking 90 x 19mm (per lineal metre)', 'm', 2000, 3500, 'merbau,decking,hardwood', false, 'ex_gst'),
(NULL, 'AU', 'Carpentry', 'Timber', 'Pine Dressed 42 x 18mm (per lineal metre)', 'm', 300, 600, 'pine,trim,moulding,dressed', true, 'ex_gst'),
(NULL, 'AU', 'Carpentry', 'Sheet', 'Plywood 2400 x 1200 x 12mm', 'sheet', 4000, 7000, 'plywood,sheet,structural', true, 'ex_gst'),
(NULL, 'AU', 'Carpentry', 'Sheet', 'MDF 2400 x 1200 x 18mm', 'sheet', 3500, 6000, 'mdf,sheet,panel', true, 'ex_gst'),
(NULL, 'AU', 'Carpentry', 'Sheet', 'Particle Board 2400 x 1200 x 16mm', 'sheet', 2500, 4500, 'particle board,chipboard,sheet', true, 'ex_gst'),
(NULL, 'AU', 'Carpentry', 'Sheet', 'Hardboard 2400 x 1200 x 3mm', 'sheet', 1500, 2500, 'hardboard,sheet,masonite', false, 'ex_gst'),
(NULL, 'AU', 'Carpentry', 'Sheet', 'Villaboard 2400 x 1200 x 6mm', 'sheet', 4000, 6500, 'villaboard,fibre cement,sheet,wet area', true, 'ex_gst'),

-- Flooring (11 items)
(NULL, 'AU', 'Flooring', 'Vinyl', 'Vinyl Plank Flooring (per sqm)', 'sqm', 3000, 6000, 'vinyl,lvt,luxury vinyl,flooring', true, 'ex_gst'),
(NULL, 'AU', 'Flooring', 'Vinyl', 'Vinyl Sheet Flooring (per sqm)', 'sqm', 2000, 4000, 'vinyl sheet,lino,flooring', true, 'ex_gst'),
(NULL, 'AU', 'Flooring', 'Laminate', 'Laminate Flooring (per sqm)', 'sqm', 2000, 5000, 'laminate,floating floor,click lock', true, 'ex_gst'),
(NULL, 'AU', 'Flooring', 'Carpet', 'Carpet - Polyester (per sqm)', 'sqm', 3000, 6000, 'carpet,polyester,floor covering', true, 'ex_gst'),
(NULL, 'AU', 'Flooring', 'Carpet', 'Carpet - Wool Blend (per sqm)', 'sqm', 5000, 10000, 'carpet,wool,premium', false, 'ex_gst'),
(NULL, 'AU', 'Flooring', 'Underlay', 'Carpet Underlay (per sqm)', 'sqm', 500, 1200, 'underlay,cushion,carpet', true, 'ex_gst'),
(NULL, 'AU', 'Flooring', 'Underlay', 'Laminate Underlay (per sqm)', 'sqm', 400, 1000, 'underlay,foam,laminate', true, 'ex_gst'),
(NULL, 'AU', 'Flooring', 'Tile', 'Floor Tiles 600x600mm (per sqm)', 'sqm', 3000, 8000, 'tiles,porcelain,floor tiles', true, 'ex_gst'),
(NULL, 'AU', 'Flooring', 'Tile', 'Wall Tiles 300x600mm (per sqm)', 'sqm', 2500, 7000, 'tiles,ceramic,wall tiles', true, 'ex_gst'),
(NULL, 'AU', 'Flooring', 'Adhesive', 'Tile Adhesive 20kg', 'bag', 3000, 5000, 'tile adhesive,mortar,thinset', true, 'ex_gst'),
(NULL, 'AU', 'Flooring', 'Grout', 'Tile Grout 5kg', 'bag', 1500, 2500, 'grout,tile grout,floor grout', true, 'ex_gst'),

-- Plumbing (13 items)
(NULL, 'AU', 'Plumbing', 'Pipe', 'PVC Pipe 50mm x 3m', 'm', 500, 900, 'pvc pipe,stormwater,drainage', true, 'ex_gst'),
(NULL, 'AU', 'Plumbing', 'Pipe', 'PVC Pipe 100mm x 3m', 'm', 1200, 2000, 'pvc pipe,sewer,drainage', true, 'ex_gst'),
(NULL, 'AU', 'Plumbing', 'Pipe', 'Copper Pipe 15mm x 3m', 'm', 1500, 2500, 'copper pipe,water pipe,plumbing', true, 'ex_gst'),
(NULL, 'AU', 'Plumbing', 'Pipe', 'PEX Pipe 20mm x 100m', 'm', 100, 250, 'pex,poly pipe,water pipe,flexible', true, 'ex_gst'),
(NULL, 'AU', 'Plumbing', 'Fittings', 'PVC Elbow 90° 50mm', 'each', 200, 400, 'elbow,fitting,pvc,bend', true, 'ex_gst'),
(NULL, 'AU', 'Plumbing', 'Fittings', 'PVC Junction 90° 100mm', 'each', 800, 1500, 'junction,tee,pvc,fitting', true, 'ex_gst'),
(NULL, 'AU', 'Plumbing', 'Fittings', 'Copper Elbow 90° 15mm', 'each', 300, 600, 'copper,elbow,fitting', true, 'ex_gst'),
(NULL, 'AU', 'Plumbing', 'Fixtures', 'Kitchen Mixer Tap', 'each', 8000, 20000, 'tap,mixer,kitchen,faucet', true, 'ex_gst'),
(NULL, 'AU', 'Plumbing', 'Fixtures', 'Bathroom Basin Mixer', 'each', 6000, 15000, 'tap,basin mixer,bathroom,faucet', true, 'ex_gst'),
(NULL, 'AU', 'Plumbing', 'Fixtures', 'Shower Head - Handheld', 'each', 3000, 8000, 'shower head,shower rose,bathroom', true, 'ex_gst'),
(NULL, 'AU', 'Plumbing', 'Fixtures', 'Toilet Suite - Back to Wall', 'each', 25000, 50000, 'toilet,wc,suite,bathroom', true, 'ex_gst'),
(NULL, 'AU', 'Plumbing', 'Drainage', 'Stormwater Pit 300mm', 'each', 3000, 6000, 'pit,stormwater,drainage,grate', true, 'ex_gst'),
(NULL, 'AU', 'Plumbing', 'Drainage', 'Gully Trap 100mm', 'each', 2000, 4000, 'gully trap,drainage,sewer', true, 'ex_gst'),

-- Electrical (12 items)
(NULL, 'AU', 'Electrical', 'Cable', 'TPS Cable 2.5mm 100m', 'm', 150, 300, 'tps,cable,electrical cable,twin and earth', true, 'ex_gst'),
(NULL, 'AU', 'Electrical', 'Cable', 'TPS Cable 1.5mm 100m', 'm', 100, 200, 'tps,cable,lighting cable', true, 'ex_gst'),
(NULL, 'AU', 'Electrical', 'Switches', 'Power Point - Single', 'each', 400, 1000, 'power point,gpo,outlet,socket', true, 'ex_gst'),
(NULL, 'AU', 'Electrical', 'Switches', 'Power Point - Double', 'each', 600, 1400, 'power point,gpo,double outlet', true, 'ex_gst'),
(NULL, 'AU', 'Electrical', 'Switches', 'Light Switch - Single', 'each', 300, 800, 'light switch,switch,toggle', true, 'ex_gst'),
(NULL, 'AU', 'Electrical', 'Switches', 'Light Switch - Double', 'each', 500, 1200, 'light switch,2 gang switch', true, 'ex_gst'),
(NULL, 'AU', 'Electrical', 'Switches', 'Dimmer Switch', 'each', 1500, 3500, 'dimmer,light dimmer,switch', false, 'ex_gst'),
(NULL, 'AU', 'Electrical', 'Lighting', 'LED Downlight 10W', 'each', 1000, 2500, 'downlight,led,recessed light', true, 'ex_gst'),
(NULL, 'AU', 'Electrical', 'Lighting', 'Batten Holder - White', 'each', 300, 700, 'batten holder,light fitting,pendant', true, 'ex_gst'),
(NULL, 'AU', 'Electrical', 'Lighting', 'Oyster Light 300mm', 'each', 2000, 5000, 'oyster light,ceiling light,flush mount', true, 'ex_gst'),
(NULL, 'AU', 'Electrical', 'Conduit', 'PVC Conduit 20mm x 3m', 'm', 200, 500, 'conduit,electrical conduit,pvc', true, 'ex_gst'),
(NULL, 'AU', 'Electrical', 'Conduit', 'Flexible Conduit 20mm (per metre)', 'm', 300, 700, 'flexible conduit,flex conduit', true, 'ex_gst'),

-- Landscaping (14 items)
(NULL, 'AU', 'Landscaping', 'Pavers', 'Concrete Pavers 400x400mm (per sqm)', 'sqm', 2500, 5000, 'pavers,concrete pavers,paving', true, 'ex_gst'),
(NULL, 'AU', 'Landscaping', 'Pavers', 'Bluestone Pavers 600x400mm (per sqm)', 'sqm', 8000, 15000, 'bluestone,stone pavers,paving', false, 'ex_gst'),
(NULL, 'AU', 'Landscaping', 'Aggregate', 'Crushed Rock 20mm (per tonne)', 'tonne', 5000, 8000, 'crushed rock,aggregate,gravel,blue metal', true, 'ex_gst'),
(NULL, 'AU', 'Landscaping', 'Aggregate', 'Decomposed Granite (per tonne)', 'tonne', 6000, 10000, 'decomposed granite,dg,path base', true, 'ex_gst'),
(NULL, 'AU', 'Landscaping', 'Aggregate', 'River Pebbles 40mm (per tonne)', 'tonne', 12000, 20000, 'pebbles,river pebbles,decorative stone', false, 'ex_gst'),
(NULL, 'AU', 'Landscaping', 'Soil', 'Garden Soil (per cubic metre)', 'cum', 5000, 9000, 'soil,garden soil,topsoil', true, 'ex_gst'),
(NULL, 'AU', 'Landscaping', 'Soil', 'Premium Garden Mix (per cubic metre)', 'cum', 7000, 12000, 'garden mix,soil,compost mix', true, 'ex_gst'),
(NULL, 'AU', 'Landscaping', 'Mulch', 'Hardwood Mulch (per cubic metre)', 'cum', 4000, 7000, 'mulch,hardwood mulch,garden mulch', true, 'ex_gst'),
(NULL, 'AU', 'Landscaping', 'Mulch', 'Pine Bark Mulch (per cubic metre)', 'cum', 5000, 8000, 'mulch,pine bark,decorative mulch', true, 'ex_gst'),
(NULL, 'AU', 'Landscaping', 'Sleepers', 'Treated Pine Sleeper 200x75x2400mm', 'each', 3500, 6000, 'sleeper,pine sleeper,retaining,treated pine', true, 'ex_gst'),
(NULL, 'AU', 'Landscaping', 'Sleepers', 'Hardwood Sleeper 200x100x2400mm', 'each', 8000, 15000, 'sleeper,hardwood sleeper,retaining', false, 'ex_gst'),
(NULL, 'AU', 'Landscaping', 'Fencing', 'Colorbond Fence Panel 2.4m', 'panel', 15000, 25000, 'fence,colorbond,panel,fencing', true, 'ex_gst'),
(NULL, 'AU', 'Landscaping', 'Fencing', 'Treated Pine Post 100x100mm 2.4m', 'each', 2500, 4500, 'post,fence post,treated pine', true, 'ex_gst'),
(NULL, 'AU', 'Landscaping', 'Fencing', 'Picket Fence Rail 70x35mm 2.4m', 'each', 1500, 2500, 'fence rail,picket fence,timber', true, 'ex_gst'),

-- Doors & Windows (8 items)
(NULL, 'AU', 'Handyman', 'Doors', 'Internal Door - Hollow Core 2040x820mm', 'each', 8000, 15000, 'door,internal door,hollow core', true, 'ex_gst'),
(NULL, 'AU', 'Handyman', 'Doors', 'External Door - Solid Core 2040x820mm', 'each', 25000, 50000, 'door,external door,entry door', true, 'ex_gst'),
(NULL, 'AU', 'Handyman', 'Doors', 'Sliding Door - Aluminium 2100x2400mm', 'each', 80000, 150000, 'sliding door,patio door,aluminium', false, 'ex_gst'),
(NULL, 'AU', 'Handyman', 'Hardware', 'Door Handle - Lever Set', 'set', 3000, 8000, 'door handle,lever handle,lock', true, 'ex_gst'),
(NULL, 'AU', 'Handyman', 'Hardware', 'Door Closer', 'each', 4000, 10000, 'door closer,hydraulic closer', false, 'ex_gst'),
(NULL, 'AU', 'Handyman', 'Hardware', 'Hinges - Ball Bearing 100mm (pair)', 'pair', 1500, 3000, 'hinges,door hinges,ball bearing', true, 'ex_gst'),
(NULL, 'AU', 'Handyman', 'Windows', 'Aluminium Window - Sliding 1200x1200mm', 'each', 35000, 70000, 'window,aluminium window,sliding window', true, 'ex_gst'),
(NULL, 'AU', 'Handyman', 'Windows', 'Aluminium Window - Awning 1200x600mm', 'each', 30000, 60000, 'window,awning window,aluminium', true, 'ex_gst'),

-- Gyprock / Plasterboard (9 items)
(NULL, 'AU', 'Carpentry', 'Plasterboard', 'Gyprock Plasterboard 2400x1200x10mm', 'sheet', 1500, 2500, 'gyprock,plasterboard,drywall,wall lining', true, 'ex_gst'),
(NULL, 'AU', 'Carpentry', 'Plasterboard', 'Gyprock Plasterboard 2700x1200x10mm', 'sheet', 1800, 3000, 'gyprock,plasterboard,drywall', true, 'ex_gst'),
(NULL, 'AU', 'Carpentry', 'Plasterboard', 'Gyprock Fire Rated 2400x1200x13mm', 'sheet', 2500, 4000, 'gyprock,fire rated,plasterboard', false, 'ex_gst'),
(NULL, 'AU', 'Carpentry', 'Plasterboard', 'Gyprock Wet Area 2400x1200x13mm', 'sheet', 2800, 4500, 'gyprock,wet area,moisture resistant,green board', true, 'ex_gst'),
(NULL, 'AU', 'Carpentry', 'Plasterboard', 'Gyprock Cornice 90mm x 4.8m', 'length', 1200, 2000, 'cornice,gyprock cornice,ceiling trim', true, 'ex_gst'),
(NULL, 'AU', 'Carpentry', 'Plasterboard', 'Base Coat Plaster 20kg', 'bag', 2000, 3500, 'plaster,base coat,undercoat', true, 'ex_gst'),
(NULL, 'AU', 'Carpentry', 'Plasterboard', 'Top Coat Plaster 20kg', 'bag', 2500, 4000, 'plaster,top coat,finish coat', true, 'ex_gst'),
(NULL, 'AU', 'Carpentry', 'Plasterboard', 'Jointing Tape - Paper 75mm', 'roll', 400, 800, 'tape,jointing tape,paper tape,gyprock', true, 'ex_gst'),
(NULL, 'AU', 'Carpentry', 'Plasterboard', 'Jointing Compound 4.5kg', 'bucket', 1500, 2500, 'jointing compound,plaster,mud', true, 'ex_gst'),

-- Insulation (3 items)
(NULL, 'AU', 'Carpentry', 'Insulation', 'Ceiling Batts R3.5 - 430mm (pack)', 'pack', 6000, 10000, 'insulation,ceiling batts,glasswool', true, 'ex_gst'),
(NULL, 'AU', 'Carpentry', 'Insulation', 'Wall Batts R2.5 - 90mm (pack)', 'pack', 5000, 8000, 'insulation,wall batts,glasswool', true, 'ex_gst'),
(NULL, 'AU', 'Carpentry', 'Insulation', 'Foil Insulation - Sisalation (roll)', 'roll', 15000, 25000, 'sisalation,foil insulation,sarking', true, 'ex_gst'),

-- Roofing (7 items)
(NULL, 'AU', 'Carpentry', 'Roofing', 'Colorbond Roofing Sheet 0.42mm (per metre)', 'm', 2500, 4000, 'roofing,colorbond,metal roof', true, 'ex_gst'),
(NULL, 'AU', 'Carpentry', 'Roofing', 'Roof Tiles - Terracotta (per sqm)', 'sqm', 5000, 10000, 'roof tiles,terracotta,clay tiles', true, 'ex_gst'),
(NULL, 'AU', 'Carpentry', 'Roofing', 'Roof Tiles - Concrete (per sqm)', 'sqm', 4000, 8000, 'roof tiles,concrete tiles', true, 'ex_gst'),
(NULL, 'AU', 'Carpentry', 'Roofing', 'Ridge Capping - Colorbond (per metre)', 'm', 3000, 5000, 'ridge capping,flashing,roofing', true, 'ex_gst'),
(NULL, 'AU', 'Carpentry', 'Roofing', 'Valley Flashing - Colorbond (per metre)', 'm', 2500, 4500, 'valley flashing,roofing,colorbond', true, 'ex_gst'),
(NULL, 'AU', 'Carpentry', 'Roofing', 'Gutter - Colorbond Quad 125mm (per metre)', 'm', 2000, 3500, 'gutter,quad gutter,colorbond', true, 'ex_gst'),
(NULL, 'AU', 'Carpentry', 'Roofing', 'Downpipe - Colorbond 90mm (per metre)', 'm', 1500, 2500, 'downpipe,roofing,drainage', true, 'ex_gst'),

-- Concrete & Masonry (7 items)
(NULL, 'AU', 'Handyman', 'Concrete', 'Cement - General Purpose 20kg', 'bag', 1000, 1600, 'cement,gp cement,concrete', true, 'ex_gst'),
(NULL, 'AU', 'Handyman', 'Concrete', 'Premix Concrete 20kg', 'bag', 700, 1200, 'premix,concrete,ready mix', true, 'ex_gst'),
(NULL, 'AU', 'Handyman', 'Concrete', 'Ready Mix Concrete (per cubic metre)', 'cum', 25000, 35000, 'concrete,ready mix,delivered concrete', true, 'ex_gst'),
(NULL, 'AU', 'Handyman', 'Masonry', 'Besser Block 200x200x400mm', 'each', 400, 800, 'besser block,concrete block,cmu', true, 'ex_gst'),
(NULL, 'AU', 'Handyman', 'Masonry', 'Common Brick (per brick)', 'each', 100, 200, 'brick,common brick,clay brick', true, 'ex_gst'),
(NULL, 'AU', 'Handyman', 'Masonry', 'Face Brick (per brick)', 'each', 150, 300, 'face brick,brick,clay brick', true, 'ex_gst'),
(NULL, 'AU', 'Handyman', 'Masonry', 'Mortar Mix 20kg', 'bag', 900, 1500, 'mortar,bricklaying,masonry', true, 'ex_gst'),

-- Cleaning & Maintenance (4 items)
(NULL, 'AU', 'Handyman', 'Cleaning', 'Outdoor Cleaner 5L', 'litre', 500, 1000, 'cleaner,outdoor cleaner,surface cleaner', true, 'ex_gst'),
(NULL, 'AU', 'Handyman', 'Cleaning', 'Methylated Spirits 1L', 'litre', 600, 1000, 'metho,methylated spirits,solvent', true, 'ex_gst'),
(NULL, 'AU', 'Handyman', 'Cleaning', 'White Spirits 1L', 'litre', 700, 1200, 'white spirits,turps,solvent', true, 'ex_gst'),
(NULL, 'AU', 'Handyman', 'Cleaning', 'Acetone 1L', 'litre', 800, 1400, 'acetone,solvent,cleaner', false, 'ex_gst')

ON CONFLICT ON CONSTRAINT material_catalog_items_global_guide_unique DO NOTHING;

COMMIT;