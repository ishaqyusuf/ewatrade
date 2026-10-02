(() => {
  // packages/utils/src/business-catalog-guidance.json
  var business_catalog_guidance_default = {
    schemaVersion: 1,
    defaults: {
      product: {
        kind: "product",
        name: {
          placeholder: "e.g. Your product name",
          examples: ["Your product name", "Handmade item"]
        },
        description: {
          placeholder: "e.g. Describe the item customers will receive.",
          helperText: "Describe what customers will receive."
        },
        options: {
          namePlaceholder: "e.g. Size, Colour, Material",
          helperText: "Add customer choices such as Size, Colour, Material, or enter your own.",
          suggestedOptions: [
            {
              key: "size",
              label: "Size",
              aliases: [],
              namePlaceholder: "e.g. Size",
              helperText: "Choose the values you actually offer; you can enter your own.",
              valuePlaceholder: "e.g. Small, Medium, Large",
              suggestedValues: ["Small", "Medium", "Large"]
            },
            {
              key: "colour",
              label: "Colour",
              aliases: ["Color"],
              namePlaceholder: "e.g. Colour",
              helperText: "Choose the values you actually offer; you can enter your own.",
              valuePlaceholder: "e.g. Black, White, Blue",
              suggestedValues: ["Black", "White", "Blue"]
            },
            {
              key: "material",
              label: "Material",
              aliases: [],
              namePlaceholder: "e.g. Material",
              helperText: "Choose the values you actually offer; you can enter your own.",
              valuePlaceholder: "e.g. Wood, Metal, Fabric",
              suggestedValues: ["Wood", "Metal", "Fabric"]
            }
          ]
        },
        stockUnit: {
          placeholder: "e.g. Piece, Kilogram, Litre",
          helperText: "Choose the main unit you count this product in. Configure other selling units separately.",
          suggestions: ["Piece", "Kilogram", "Litre"]
        }
      },
      service: {
        kind: "service",
        name: {
          placeholder: "e.g. Your service name",
          examples: ["Your service name", "Consultation"]
        },
        description: {
          placeholder: "e.g. Describe the work and what is included.",
          helperText: "Describe what customers will receive."
        },
        options: {
          namePlaceholder: "e.g. Package, Service level, Visit type",
          helperText: "Add customer choices such as Package, Service level, Visit type, or enter your own.",
          suggestedOptions: [
            {
              key: "package",
              label: "Package",
              aliases: [],
              namePlaceholder: "e.g. Package",
              helperText: "Choose the values you actually offer; you can enter your own.",
              valuePlaceholder: "e.g. Basic, Standard, Premium",
              suggestedValues: ["Basic", "Standard", "Premium"]
            },
            {
              key: "service-level",
              label: "Service level",
              aliases: [],
              namePlaceholder: "e.g. Service level",
              helperText: "Choose the values you actually offer; you can enter your own.",
              valuePlaceholder: "e.g. Standard, Express, Premium",
              suggestedValues: ["Standard", "Express", "Premium"]
            },
            {
              key: "visit-type",
              label: "Visit type",
              aliases: [],
              namePlaceholder: "e.g. Visit type",
              helperText: "Choose the values you actually offer; you can enter your own.",
              valuePlaceholder: "e.g. Remote, In-store, On-site",
              suggestedValues: ["Remote", "In-store", "On-site"]
            }
          ]
        }
      }
    },
    byBusinessProfile: {
      "general-retail-groceries": {
        product: {
          kind: "product",
          name: {
            placeholder: "e.g. Rice",
            examples: ["Rice", "Cooking oil", "Breakfast cereal"]
          },
          description: {
            placeholder: "e.g. Describe the variety, ingredients or packaging.",
            helperText: "Describe what customers will receive."
          },
          options: {
            namePlaceholder: "e.g. Brand, Variety, Grade",
            helperText: "Add customer choices such as Brand, Variety, Grade, or enter your own.",
            suggestedOptions: [
              {
                key: "brand",
                label: "Brand",
                aliases: [],
                namePlaceholder: "e.g. Brand",
                helperText: "Choose the values you actually offer; you can enter your own.",
                valuePlaceholder: "e.g. Local brand, Store brand, Imported brand",
                suggestedValues: [
                  "Local brand",
                  "Store brand",
                  "Imported brand"
                ]
              },
              {
                key: "variety",
                label: "Variety",
                aliases: [],
                namePlaceholder: "e.g. Variety",
                helperText: "Choose the values you actually offer; you can enter your own.",
                valuePlaceholder: "e.g. Long grain, Short grain, Brown rice",
                suggestedValues: ["Long grain", "Short grain", "Brown rice"]
              },
              {
                key: "grade",
                label: "Grade",
                aliases: [],
                namePlaceholder: "e.g. Grade",
                helperText: "Choose the values you actually offer; you can enter your own.",
                valuePlaceholder: "e.g. Standard, Premium",
                suggestedValues: ["Standard", "Premium"]
              }
            ]
          },
          stockUnit: {
            placeholder: "e.g. Piece, Kilogram, Litre",
            helperText: "Choose the main unit you count this product in. Configure other selling units separately.",
            suggestions: ["Piece", "Kilogram", "Litre"]
          }
        },
        service: {
          kind: "service",
          name: {
            placeholder: "e.g. Gift wrapping",
            examples: ["Gift wrapping", "Grocery packing"]
          },
          description: {
            placeholder: "e.g. Describe what is included in this service.",
            helperText: "Describe what customers will receive."
          },
          options: {
            namePlaceholder: "e.g. Wrapping style, Package, Occasion",
            helperText: "Add customer choices such as Wrapping style, Package, Occasion, or enter your own.",
            suggestedOptions: [
              {
                key: "wrapping-style",
                label: "Wrapping style",
                aliases: [],
                namePlaceholder: "e.g. Wrapping style",
                helperText: "Choose the values you actually offer; you can enter your own.",
                valuePlaceholder: "e.g. Paper, Gift bag, Gift box",
                suggestedValues: ["Paper", "Gift bag", "Gift box"]
              },
              {
                key: "package",
                label: "Package",
                aliases: [],
                namePlaceholder: "e.g. Package",
                helperText: "Choose the values you actually offer; you can enter your own.",
                valuePlaceholder: "e.g. Basic, Standard, Premium",
                suggestedValues: ["Basic", "Standard", "Premium"]
              },
              {
                key: "occasion",
                label: "Occasion",
                aliases: [],
                namePlaceholder: "e.g. Occasion",
                helperText: "Choose the values you actually offer; you can enter your own.",
                valuePlaceholder: "e.g. Birthday, Wedding, Thank you",
                suggestedValues: ["Birthday", "Wedding", "Thank you"]
              }
            ]
          }
        }
      },
      "animal-feed-agricultural-supplies": {
        product: {
          kind: "product",
          name: {
            placeholder: "e.g. Fresh eggs",
            examples: [
              "Fresh eggs",
              "Live broiler",
              "Fresh tomatoes",
              "Layer feed"
            ]
          },
          description: {
            placeholder: "e.g. Fresh eggs collected from our farm.",
            helperText: "Describe what customers will receive."
          },
          options: {
            namePlaceholder: "e.g. Bird type, Egg size, Grade",
            helperText: "Add customer choices such as Bird type, Egg size, Grade, or enter your own.",
            suggestedOptions: [
              {
                key: "bird-type",
                label: "Bird type",
                aliases: ["Poultry type"],
                namePlaceholder: "e.g. Bird type",
                helperText: "Choose the values you actually offer; you can enter your own.",
                valuePlaceholder: "e.g. Broiler, Layer, Cockerel",
                suggestedValues: ["Broiler", "Layer", "Cockerel"]
              },
              {
                key: "egg-size",
                label: "Egg size",
                aliases: ["Size"],
                namePlaceholder: "e.g. Egg size",
                helperText: "Choose the values you actually offer; you can enter your own.",
                valuePlaceholder: "e.g. Small, Medium, Large",
                suggestedValues: ["Small", "Medium", "Large"]
              },
              {
                key: "grade",
                label: "Grade",
                aliases: [],
                namePlaceholder: "e.g. Grade",
                helperText: "Choose the values you actually offer; you can enter your own.",
                valuePlaceholder: "e.g. Grade A, Grade B, Standard",
                suggestedValues: ["Grade A", "Grade B", "Standard"]
              },
              {
                key: "produce-type",
                label: "Produce type",
                aliases: [],
                namePlaceholder: "e.g. Produce type",
                helperText: "Choose the values you actually offer; you can enter your own.",
                valuePlaceholder: "e.g. Tomato, Pepper, Maize",
                suggestedValues: ["Tomato", "Pepper", "Maize"]
              },
              {
                key: "feed-type",
                label: "Feed type",
                aliases: [],
                namePlaceholder: "e.g. Feed type",
                helperText: "Choose the values you actually offer; you can enter your own.",
                valuePlaceholder: "e.g. Starter, Grower, Finisher",
                suggestedValues: ["Starter", "Grower", "Finisher", "Layer mash"]
              }
            ]
          },
          stockUnit: {
            placeholder: "e.g. Egg, Bird, Kilogram, Bag",
            helperText: "Choose the main unit you count this product in. Configure other selling units separately.",
            suggestions: ["Egg", "Bird", "Kilogram", "Bag"]
          }
        },
        service: {
          kind: "service",
          name: {
            placeholder: "e.g. Produce sorting",
            examples: ["Produce sorting", "Farm equipment cleaning"]
          },
          description: {
            placeholder: "e.g. Describe the farm work and what is included.",
            helperText: "Describe what customers will receive."
          },
          options: {
            namePlaceholder: "e.g. Work type, Produce type, Service location",
            helperText: "Add customer choices such as Work type, Produce type, Service location, or enter your own.",
            suggestedOptions: [
              {
                key: "work-type",
                label: "Work type",
                aliases: [],
                namePlaceholder: "e.g. Work type",
                helperText: "Choose the values you actually offer; you can enter your own.",
                valuePlaceholder: "e.g. Sorting, Cleaning, Packing",
                suggestedValues: ["Sorting", "Cleaning", "Packing"]
              },
              {
                key: "produce-type",
                label: "Produce type",
                aliases: [],
                namePlaceholder: "e.g. Produce type",
                helperText: "Choose the values you actually offer; you can enter your own.",
                valuePlaceholder: "e.g. Tomato, Pepper, Maize",
                suggestedValues: ["Tomato", "Pepper", "Maize"]
              },
              {
                key: "service-location",
                label: "Service location",
                aliases: [],
                namePlaceholder: "e.g. Service location",
                helperText: "Choose the values you actually offer; you can enter your own.",
                valuePlaceholder: "e.g. On-farm, At our premises",
                suggestedValues: ["On-farm", "At our premises"]
              }
            ]
          }
        }
      },
      "fashion-apparel": {
        product: {
          kind: "product",
          name: {
            placeholder: "e.g. Cotton shirt",
            examples: ["Cotton shirt", "Ankara tote bag", "Leather sandals"]
          },
          description: {
            placeholder: "e.g. Describe the fit, fabric and finish.",
            helperText: "Describe what customers will receive."
          },
          options: {
            namePlaceholder: "e.g. Size, Colour, Material",
            helperText: "Add customer choices such as Size, Colour, Material, or enter your own.",
            suggestedOptions: [
              {
                key: "size",
                label: "Size",
                aliases: [],
                namePlaceholder: "e.g. Size",
                helperText: "Choose the values you actually offer; you can enter your own.",
                valuePlaceholder: "e.g. XS, S, M",
                suggestedValues: ["XS", "S", "M", "L", "XL", "XXL"]
              },
              {
                key: "colour",
                label: "Colour",
                aliases: ["Color"],
                namePlaceholder: "e.g. Colour",
                helperText: "Choose the values you actually offer; you can enter your own.",
                valuePlaceholder: "e.g. Black, White, Blue",
                suggestedValues: ["Black", "White", "Blue", "Red", "Green"]
              },
              {
                key: "material",
                label: "Material",
                aliases: [],
                namePlaceholder: "e.g. Material",
                helperText: "Choose the values you actually offer; you can enter your own.",
                valuePlaceholder: "e.g. Cotton, Linen, Denim",
                suggestedValues: ["Cotton", "Linen", "Denim", "Leather"]
              }
            ]
          },
          stockUnit: {
            placeholder: "e.g. Piece, Pair",
            helperText: "Choose the main unit you count this product in. Configure other selling units separately.",
            suggestions: ["Piece", "Pair"]
          }
        },
        service: {
          kind: "service",
          name: {
            placeholder: "e.g. Clothing alteration",
            examples: ["Clothing alteration", "Personal styling"]
          },
          description: {
            placeholder: "e.g. Describe the garment work or styling session.",
            helperText: "Describe what customers will receive."
          },
          options: {
            namePlaceholder: "e.g. Garment, Work type, Session format",
            helperText: "Add customer choices such as Garment, Work type, Session format, or enter your own.",
            suggestedOptions: [
              {
                key: "garment",
                label: "Garment",
                aliases: [],
                namePlaceholder: "e.g. Garment",
                helperText: "Choose the values you actually offer; you can enter your own.",
                valuePlaceholder: "e.g. Shirt, Trousers, Dress",
                suggestedValues: ["Shirt", "Trousers", "Dress"]
              },
              {
                key: "work-type",
                label: "Work type",
                aliases: [],
                namePlaceholder: "e.g. Work type",
                helperText: "Choose the values you actually offer; you can enter your own.",
                valuePlaceholder: "e.g. Hemming, Resizing, Repair",
                suggestedValues: ["Hemming", "Resizing", "Repair"]
              },
              {
                key: "session-format",
                label: "Session format",
                aliases: [],
                namePlaceholder: "e.g. Session format",
                helperText: "Choose the values you actually offer; you can enter your own.",
                valuePlaceholder: "e.g. In-person, Remote",
                suggestedValues: ["In-person", "Remote"]
              }
            ]
          }
        }
      },
      "fabrics-tailoring": {
        product: {
          kind: "product",
          name: {
            placeholder: "e.g. Ankara fabric",
            examples: ["Ankara fabric", "Cotton lining", "Sewing thread"]
          },
          description: {
            placeholder: "e.g. Describe the fabric, pattern and finish.",
            helperText: "Describe what customers will receive."
          },
          options: {
            namePlaceholder: "e.g. Material, Colour, Pattern",
            helperText: "Add customer choices such as Material, Colour, Pattern, or enter your own.",
            suggestedOptions: [
              {
                key: "material",
                label: "Material",
                aliases: [],
                namePlaceholder: "e.g. Material",
                helperText: "Choose the values you actually offer; you can enter your own.",
                valuePlaceholder: "e.g. Cotton, Linen, Silk",
                suggestedValues: ["Cotton", "Linen", "Silk", "Polyester"]
              },
              {
                key: "colour",
                label: "Colour",
                aliases: ["Color"],
                namePlaceholder: "e.g. Colour",
                helperText: "Choose the values you actually offer; you can enter your own.",
                valuePlaceholder: "e.g. Blue, Red, Black",
                suggestedValues: ["Blue", "Red", "Black", "White"]
              },
              {
                key: "pattern",
                label: "Pattern",
                aliases: [],
                namePlaceholder: "e.g. Pattern",
                helperText: "Choose the values you actually offer; you can enter your own.",
                valuePlaceholder: "e.g. Plain, Floral, Striped",
                suggestedValues: ["Plain", "Floral", "Striped", "Printed"]
              }
            ]
          },
          stockUnit: {
            placeholder: "e.g. Metre, Roll, Piece",
            helperText: "Choose the main unit you count this product in. Configure other selling units separately.",
            suggestions: ["Metre", "Roll", "Piece"]
          }
        },
        service: {
          kind: "service",
          name: {
            placeholder: "e.g. Dress tailoring",
            examples: ["Dress tailoring", "Trouser alteration"]
          },
          description: {
            placeholder: "e.g. Describe the garment and work included.",
            helperText: "Describe what customers will receive."
          },
          options: {
            namePlaceholder: "e.g. Garment, Work type, Lining",
            helperText: "Add customer choices such as Garment, Work type, Lining, or enter your own.",
            suggestedOptions: [
              {
                key: "garment",
                label: "Garment",
                aliases: [],
                namePlaceholder: "e.g. Garment",
                helperText: "Choose the values you actually offer; you can enter your own.",
                valuePlaceholder: "e.g. Dress, Shirt, Trousers",
                suggestedValues: ["Dress", "Shirt", "Trousers", "Skirt"]
              },
              {
                key: "work-type",
                label: "Work type",
                aliases: [],
                namePlaceholder: "e.g. Work type",
                helperText: "Choose the values you actually offer; you can enter your own.",
                valuePlaceholder: "e.g. New sewing, Alteration, Repair",
                suggestedValues: ["New sewing", "Alteration", "Repair"]
              },
              {
                key: "lining",
                label: "Lining",
                aliases: [],
                namePlaceholder: "e.g. Lining",
                helperText: "Choose the values you actually offer; you can enter your own.",
                valuePlaceholder: "e.g. Unlined, Partially lined, Fully lined",
                suggestedValues: ["Unlined", "Partially lined", "Fully lined"]
              }
            ]
          }
        }
      },
      "drinks-water-distribution": {
        product: {
          kind: "product",
          name: {
            placeholder: "e.g. Bottled water",
            examples: ["Bottled water", "Orange juice", "Soft drink"]
          },
          description: {
            placeholder: "e.g. Describe the drink, flavour and packaging.",
            helperText: "Describe what customers will receive."
          },
          options: {
            namePlaceholder: "e.g. Flavour, Brand, Drink type",
            helperText: "Add customer choices such as Flavour, Brand, Drink type, or enter your own.",
            suggestedOptions: [
              {
                key: "flavour",
                label: "Flavour",
                aliases: [],
                namePlaceholder: "e.g. Flavour",
                helperText: "Choose the values you actually offer; you can enter your own.",
                valuePlaceholder: "e.g. Orange, Apple, Pineapple",
                suggestedValues: ["Orange", "Apple", "Pineapple", "Lemon"]
              },
              {
                key: "brand",
                label: "Brand",
                aliases: [],
                namePlaceholder: "e.g. Brand",
                helperText: "Choose the values you actually offer; you can enter your own.",
                valuePlaceholder: "e.g. Local brand, Store brand, Imported brand",
                suggestedValues: [
                  "Local brand",
                  "Store brand",
                  "Imported brand"
                ]
              },
              {
                key: "drink-type",
                label: "Drink type",
                aliases: [],
                namePlaceholder: "e.g. Drink type",
                helperText: "Choose the values you actually offer; you can enter your own.",
                valuePlaceholder: "e.g. Still, Sparkling, Juice",
                suggestedValues: ["Still", "Sparkling", "Juice"]
              }
            ]
          },
          stockUnit: {
            placeholder: "e.g. Bottle, Crate, Litre",
            helperText: "Choose the main unit you count this product in. Configure other selling units separately.",
            suggestions: ["Bottle", "Crate", "Litre"]
          }
        },
        service: {
          kind: "service",
          name: {
            placeholder: "e.g. Event drinks supply",
            examples: ["Event drinks supply", "Dispenser cleaning"]
          },
          description: {
            placeholder: "e.g. Describe the supply or cleaning work included.",
            helperText: "Describe what customers will receive."
          },
          options: {
            namePlaceholder: "e.g. Service type, Event type, Location",
            helperText: "Add customer choices such as Service type, Event type, Location, or enter your own.",
            suggestedOptions: [
              {
                key: "service-type",
                label: "Service type",
                aliases: [],
                namePlaceholder: "e.g. Service type",
                helperText: "Choose the values you actually offer; you can enter your own.",
                valuePlaceholder: "e.g. Supply only, Supply and setup, Cleaning",
                suggestedValues: ["Supply only", "Supply and setup", "Cleaning"]
              },
              {
                key: "event-type",
                label: "Event type",
                aliases: [],
                namePlaceholder: "e.g. Event type",
                helperText: "Choose the values you actually offer; you can enter your own.",
                valuePlaceholder: "e.g. Meeting, Party, Wedding",
                suggestedValues: ["Meeting", "Party", "Wedding"]
              },
              {
                key: "location",
                label: "Location",
                aliases: [],
                namePlaceholder: "e.g. Location",
                helperText: "Choose the values you actually offer; you can enter your own.",
                valuePlaceholder: "e.g. Customer location, Our premises",
                suggestedValues: ["Customer location", "Our premises"]
              }
            ]
          }
        }
      },
      "food-bakery-catering": {
        product: {
          kind: "product",
          name: {
            placeholder: "e.g. Fresh bread",
            examples: ["Fresh bread", "Celebration cake", "Meat pie"]
          },
          description: {
            placeholder: "e.g. Describe the flavour, ingredients and portion.",
            helperText: "Describe what customers will receive."
          },
          options: {
            namePlaceholder: "e.g. Flavour, Cake size, Filling",
            helperText: "Add customer choices such as Flavour, Cake size, Filling, or enter your own.",
            suggestedOptions: [
              {
                key: "flavour",
                label: "Flavour",
                aliases: [],
                namePlaceholder: "e.g. Flavour",
                helperText: "Choose the values you actually offer; you can enter your own.",
                valuePlaceholder: "e.g. Vanilla, Chocolate, Red velvet",
                suggestedValues: ["Vanilla", "Chocolate", "Red velvet"]
              },
              {
                key: "cake-size",
                label: "Cake size",
                aliases: ["Size"],
                namePlaceholder: "e.g. Cake size",
                helperText: "Choose the values you actually offer; you can enter your own.",
                valuePlaceholder: "e.g. Small, Medium, Large",
                suggestedValues: ["Small", "Medium", "Large"]
              },
              {
                key: "filling",
                label: "Filling",
                aliases: [],
                namePlaceholder: "e.g. Filling",
                helperText: "Choose the values you actually offer; you can enter your own.",
                valuePlaceholder: "e.g. Plain, Fruit, Cream",
                suggestedValues: ["Plain", "Fruit", "Cream"]
              }
            ]
          },
          stockUnit: {
            placeholder: "e.g. Loaf, Piece, Kilogram",
            helperText: "Choose the main unit you count this product in. Configure other selling units separately.",
            suggestions: ["Loaf", "Piece", "Kilogram"]
          }
        },
        service: {
          kind: "service",
          name: {
            placeholder: "e.g. Event catering",
            examples: ["Event catering", "Meal preparation"]
          },
          description: {
            placeholder: "e.g. Describe the menu and service included.",
            helperText: "Describe what customers will receive."
          },
          options: {
            namePlaceholder: "e.g. Menu, Service type, Dietary preference",
            helperText: "Add customer choices such as Menu, Service type, Dietary preference, or enter your own.",
            suggestedOptions: [
              {
                key: "menu",
                label: "Menu",
                aliases: [],
                namePlaceholder: "e.g. Menu",
                helperText: "Choose the values you actually offer; you can enter your own.",
                valuePlaceholder: "e.g. Rice dishes, Local dishes, Mixed menu",
                suggestedValues: ["Rice dishes", "Local dishes", "Mixed menu"]
              },
              {
                key: "service-type",
                label: "Service type",
                aliases: [],
                namePlaceholder: "e.g. Service type",
                helperText: "Choose the values you actually offer; you can enter your own.",
                valuePlaceholder: "e.g. Food only, Buffet service, Plated service",
                suggestedValues: [
                  "Food only",
                  "Buffet service",
                  "Plated service"
                ]
              },
              {
                key: "dietary-preference",
                label: "Dietary preference",
                aliases: [],
                namePlaceholder: "e.g. Dietary preference",
                helperText: "Choose the values you actually offer; you can enter your own.",
                valuePlaceholder: "e.g. Regular, Vegetarian, Dairy-free",
                suggestedValues: ["Regular", "Vegetarian", "Dairy-free"]
              }
            ]
          }
        }
      },
      "beauty-salon-spa": {
        product: {
          kind: "product",
          name: {
            placeholder: "e.g. Hair shampoo",
            examples: ["Hair shampoo", "Body lotion", "Hair conditioner"]
          },
          description: {
            placeholder: "e.g. Describe the product, scent and suitable use.",
            helperText: "Describe what customers will receive."
          },
          options: {
            namePlaceholder: "e.g. Scent, Hair type, Finish",
            helperText: "Add customer choices such as Scent, Hair type, Finish, or enter your own.",
            suggestedOptions: [
              {
                key: "scent",
                label: "Scent",
                aliases: [],
                namePlaceholder: "e.g. Scent",
                helperText: "Choose the values you actually offer; you can enter your own.",
                valuePlaceholder: "e.g. Unscented, Floral, Citrus",
                suggestedValues: ["Unscented", "Floral", "Citrus"]
              },
              {
                key: "hair-type",
                label: "Hair type",
                aliases: [],
                namePlaceholder: "e.g. Hair type",
                helperText: "Choose the values you actually offer; you can enter your own.",
                valuePlaceholder: "e.g. Natural, Relaxed, All hair types",
                suggestedValues: ["Natural", "Relaxed", "All hair types"]
              },
              {
                key: "finish",
                label: "Finish",
                aliases: [],
                namePlaceholder: "e.g. Finish",
                helperText: "Choose the values you actually offer; you can enter your own.",
                valuePlaceholder: "e.g. Matte, Glossy, Natural",
                suggestedValues: ["Matte", "Glossy", "Natural"]
              }
            ]
          },
          stockUnit: {
            placeholder: "e.g. Bottle, Piece, Jar",
            helperText: "Choose the main unit you count this product in. Configure other selling units separately.",
            suggestions: ["Bottle", "Piece", "Jar"]
          }
        },
        service: {
          kind: "service",
          name: {
            placeholder: "e.g. Haircut",
            examples: ["Haircut", "Braiding", "Facial treatment"]
          },
          description: {
            placeholder: "e.g. Describe the treatment and what is included.",
            helperText: "Describe what customers will receive."
          },
          options: {
            namePlaceholder: "e.g. Style, Hair length, Treatment",
            helperText: "Add customer choices such as Style, Hair length, Treatment, or enter your own.",
            suggestedOptions: [
              {
                key: "style",
                label: "Style",
                aliases: [],
                namePlaceholder: "e.g. Style",
                helperText: "Choose the values you actually offer; you can enter your own.",
                valuePlaceholder: "e.g. Low cut, Fade, Trim",
                suggestedValues: ["Low cut", "Fade", "Trim"]
              },
              {
                key: "hair-length",
                label: "Hair length",
                aliases: [],
                namePlaceholder: "e.g. Hair length",
                helperText: "Choose the values you actually offer; you can enter your own.",
                valuePlaceholder: "e.g. Short, Medium, Long",
                suggestedValues: ["Short", "Medium", "Long"]
              },
              {
                key: "treatment",
                label: "Treatment",
                aliases: [],
                namePlaceholder: "e.g. Treatment",
                helperText: "Choose the values you actually offer; you can enter your own.",
                valuePlaceholder: "e.g. Wash, Conditioning, Scalp care",
                suggestedValues: ["Wash", "Conditioning", "Scalp care"]
              }
            ]
          }
        }
      },
      "laundry-dry-cleaning": {
        product: {
          kind: "product",
          name: {
            placeholder: "e.g. Laundry detergent",
            examples: ["Laundry detergent", "Garment bag", "Fabric softener"]
          },
          description: {
            placeholder: "e.g. Describe the laundry product and packaging.",
            helperText: "Describe what customers will receive."
          },
          options: {
            namePlaceholder: "e.g. Scent, Product type, Material",
            helperText: "Add customer choices such as Scent, Product type, Material, or enter your own.",
            suggestedOptions: [
              {
                key: "scent",
                label: "Scent",
                aliases: [],
                namePlaceholder: "e.g. Scent",
                helperText: "Choose the values you actually offer; you can enter your own.",
                valuePlaceholder: "e.g. Unscented, Fresh linen, Floral",
                suggestedValues: ["Unscented", "Fresh linen", "Floral"]
              },
              {
                key: "product-type",
                label: "Product type",
                aliases: [],
                namePlaceholder: "e.g. Product type",
                helperText: "Choose the values you actually offer; you can enter your own.",
                valuePlaceholder: "e.g. Liquid, Powder, Bar",
                suggestedValues: ["Liquid", "Powder", "Bar"]
              },
              {
                key: "material",
                label: "Material",
                aliases: [],
                namePlaceholder: "e.g. Material",
                helperText: "Choose the values you actually offer; you can enter your own.",
                valuePlaceholder: "e.g. Fabric, Plastic, Mesh",
                suggestedValues: ["Fabric", "Plastic", "Mesh"]
              }
            ]
          },
          stockUnit: {
            placeholder: "e.g. Bottle, Bag, Piece",
            helperText: "Choose the main unit you count this product in. Configure other selling units separately.",
            suggestions: ["Bottle", "Bag", "Piece"]
          }
        },
        service: {
          kind: "service",
          name: {
            placeholder: "e.g. Shirt cleaning",
            examples: ["Shirt cleaning", "Ironing", "Duvet cleaning"]
          },
          description: {
            placeholder: "e.g. Describe the garment care included.",
            helperText: "Describe what customers will receive."
          },
          options: {
            namePlaceholder: "e.g. Garment, Treatment, Size",
            helperText: "Add customer choices such as Garment, Treatment, Size, or enter your own.",
            suggestedOptions: [
              {
                key: "garment",
                label: "Garment",
                aliases: [],
                namePlaceholder: "e.g. Garment",
                helperText: "Choose the values you actually offer; you can enter your own.",
                valuePlaceholder: "e.g. Shirt, Trousers, Dress",
                suggestedValues: ["Shirt", "Trousers", "Dress", "Duvet"]
              },
              {
                key: "treatment",
                label: "Treatment",
                aliases: [],
                namePlaceholder: "e.g. Treatment",
                helperText: "Choose the values you actually offer; you can enter your own.",
                valuePlaceholder: "e.g. Wash and iron, Dry clean, Iron only",
                suggestedValues: ["Wash and iron", "Dry clean", "Iron only"]
              },
              {
                key: "size",
                label: "Size",
                aliases: [],
                namePlaceholder: "e.g. Size",
                helperText: "Choose the values you actually offer; you can enter your own.",
                valuePlaceholder: "e.g. Small, Medium, Large",
                suggestedValues: ["Small", "Medium", "Large"]
              }
            ]
          }
        }
      },
      "electronics-phone-shops": {
        product: {
          kind: "product",
          name: {
            placeholder: "e.g. Smartphone",
            examples: ["Smartphone", "USB charger", "Wireless headphones"]
          },
          description: {
            placeholder: "e.g. Describe the model, specifications and included accessories.",
            helperText: "Describe what customers will receive."
          },
          options: {
            namePlaceholder: "e.g. Model, Storage, Colour",
            helperText: "Add customer choices such as Model, Storage, Colour, or enter your own.",
            suggestedOptions: [
              {
                key: "model",
                label: "Model",
                aliases: [],
                namePlaceholder: "e.g. Model",
                helperText: "Choose the values you actually offer; you can enter your own.",
                valuePlaceholder: "e.g. Model A, Model B, Model C",
                suggestedValues: ["Model A", "Model B", "Model C"]
              },
              {
                key: "storage",
                label: "Storage",
                aliases: [],
                namePlaceholder: "e.g. Storage",
                helperText: "Choose the values you actually offer; you can enter your own.",
                valuePlaceholder: "e.g. 64 GB, 128 GB, 256 GB",
                suggestedValues: ["64 GB", "128 GB", "256 GB"]
              },
              {
                key: "colour",
                label: "Colour",
                aliases: ["Color"],
                namePlaceholder: "e.g. Colour",
                helperText: "Choose the values you actually offer; you can enter your own.",
                valuePlaceholder: "e.g. Black, Silver, Blue",
                suggestedValues: ["Black", "Silver", "Blue"]
              },
              {
                key: "connector",
                label: "Connector",
                aliases: [],
                namePlaceholder: "e.g. Connector",
                helperText: "Choose the values you actually offer; you can enter your own.",
                valuePlaceholder: "e.g. USB-C, Micro USB, Lightning",
                suggestedValues: ["USB-C", "Micro USB", "Lightning"]
              }
            ]
          },
          stockUnit: {
            placeholder: "e.g. Piece, Pair",
            helperText: "Choose the main unit you count this product in. Configure other selling units separately.",
            suggestions: ["Piece", "Pair"]
          }
        },
        service: {
          kind: "service",
          name: {
            placeholder: "e.g. Phone screen replacement",
            examples: ["Phone screen replacement", "Laptop servicing"]
          },
          description: {
            placeholder: "e.g. Describe the device work and parts included.",
            helperText: "Describe what customers will receive."
          },
          options: {
            namePlaceholder: "e.g. Device type, Repair type, Service location",
            helperText: "Add customer choices such as Device type, Repair type, Service location, or enter your own.",
            suggestedOptions: [
              {
                key: "device-type",
                label: "Device type",
                aliases: [],
                namePlaceholder: "e.g. Device type",
                helperText: "Choose the values you actually offer; you can enter your own.",
                valuePlaceholder: "e.g. Phone, Tablet, Laptop",
                suggestedValues: ["Phone", "Tablet", "Laptop"]
              },
              {
                key: "repair-type",
                label: "Repair type",
                aliases: [],
                namePlaceholder: "e.g. Repair type",
                helperText: "Choose the values you actually offer; you can enter your own.",
                valuePlaceholder: "e.g. Screen replacement, Battery replacement, Charging port repair",
                suggestedValues: [
                  "Screen replacement",
                  "Battery replacement",
                  "Charging port repair"
                ]
              },
              {
                key: "service-location",
                label: "Service location",
                aliases: [],
                namePlaceholder: "e.g. Service location",
                helperText: "Choose the values you actually offer; you can enter your own.",
                valuePlaceholder: "e.g. In-store, Customer location",
                suggestedValues: ["In-store", "Customer location"]
              }
            ]
          }
        }
      },
      "repair-maintenance": {
        product: {
          kind: "product",
          name: {
            placeholder: "e.g. Replacement belt",
            examples: ["Replacement belt", "Water pump", "Appliance filter"]
          },
          description: {
            placeholder: "e.g. Describe the part and compatible equipment.",
            helperText: "Describe what customers will receive."
          },
          options: {
            namePlaceholder: "e.g. Compatible model, Part type, Material",
            helperText: "Add customer choices such as Compatible model, Part type, Material, or enter your own.",
            suggestedOptions: [
              {
                key: "compatible-model",
                label: "Compatible model",
                aliases: [],
                namePlaceholder: "e.g. Compatible model",
                helperText: "Choose the values you actually offer; you can enter your own.",
                valuePlaceholder: "e.g. Model A, Model B, Model C",
                suggestedValues: ["Model A", "Model B", "Model C"]
              },
              {
                key: "part-type",
                label: "Part type",
                aliases: [],
                namePlaceholder: "e.g. Part type",
                helperText: "Choose the values you actually offer; you can enter your own.",
                valuePlaceholder: "e.g. Original, Compatible, Refurbished",
                suggestedValues: ["Original", "Compatible", "Refurbished"]
              },
              {
                key: "material",
                label: "Material",
                aliases: [],
                namePlaceholder: "e.g. Material",
                helperText: "Choose the values you actually offer; you can enter your own.",
                valuePlaceholder: "e.g. Steel, Plastic, Rubber",
                suggestedValues: ["Steel", "Plastic", "Rubber"]
              }
            ]
          },
          stockUnit: {
            placeholder: "e.g. Piece, Pair, Set",
            helperText: "Choose the main unit you count this product in. Configure other selling units separately.",
            suggestions: ["Piece", "Pair", "Set"]
          }
        },
        service: {
          kind: "service",
          name: {
            placeholder: "e.g. Appliance repair",
            examples: ["Appliance repair", "Generator servicing"]
          },
          description: {
            placeholder: "e.g. Describe the equipment and maintenance work.",
            helperText: "Describe what customers will receive."
          },
          options: {
            namePlaceholder: "e.g. Appliance type, Work type, Visit type",
            helperText: "Add customer choices such as Appliance type, Work type, Visit type, or enter your own.",
            suggestedOptions: [
              {
                key: "appliance-type",
                label: "Appliance type",
                aliases: [],
                namePlaceholder: "e.g. Appliance type",
                helperText: "Choose the values you actually offer; you can enter your own.",
                valuePlaceholder: "e.g. Washing machine, Refrigerator, Air conditioner",
                suggestedValues: [
                  "Washing machine",
                  "Refrigerator",
                  "Air conditioner"
                ]
              },
              {
                key: "work-type",
                label: "Work type",
                aliases: [],
                namePlaceholder: "e.g. Work type",
                helperText: "Choose the values you actually offer; you can enter your own.",
                valuePlaceholder: "e.g. Inspection, Repair, Maintenance",
                suggestedValues: ["Inspection", "Repair", "Maintenance"]
              },
              {
                key: "visit-type",
                label: "Visit type",
                aliases: [],
                namePlaceholder: "e.g. Visit type",
                helperText: "Choose the values you actually offer; you can enter your own.",
                valuePlaceholder: "e.g. Workshop, On-site",
                suggestedValues: ["Workshop", "On-site"]
              }
            ]
          }
        }
      },
      "pharmacy-health-retail": {
        product: {
          kind: "product",
          name: {
            placeholder: "e.g. Adhesive bandages",
            examples: [
              "Adhesive bandages",
              "Digital thermometer",
              "First aid kit"
            ]
          },
          description: {
            placeholder: "e.g. Describe the packaged item and manufacturer information.",
            helperText: "Describe what customers will receive."
          },
          options: {
            namePlaceholder: "e.g. Brand, Material, Size",
            helperText: "Add customer choices such as Brand, Material, Size, or enter your own.",
            suggestedOptions: [
              {
                key: "brand",
                label: "Brand",
                aliases: [],
                namePlaceholder: "e.g. Brand",
                helperText: "Choose the values you actually offer; you can enter your own.",
                valuePlaceholder: "e.g. Local brand, Store brand, Imported brand",
                suggestedValues: [
                  "Local brand",
                  "Store brand",
                  "Imported brand"
                ]
              },
              {
                key: "material",
                label: "Material",
                aliases: [],
                namePlaceholder: "e.g. Material",
                helperText: "Choose the values you actually offer; you can enter your own.",
                valuePlaceholder: "e.g. Fabric, Plastic, Latex-free",
                suggestedValues: ["Fabric", "Plastic", "Latex-free"]
              },
              {
                key: "size",
                label: "Size",
                aliases: [],
                namePlaceholder: "e.g. Size",
                helperText: "Choose the values you actually offer; you can enter your own.",
                valuePlaceholder: "e.g. Small, Medium, Large",
                suggestedValues: ["Small", "Medium", "Large"]
              }
            ]
          },
          stockUnit: {
            placeholder: "e.g. Pack, Piece, Box",
            helperText: "Choose the main unit you count this product in. Configure other selling units separately.",
            suggestions: ["Pack", "Piece", "Box"]
          }
        },
        service: {
          kind: "service",
          name: {
            placeholder: "e.g. Health equipment cleaning",
            examples: ["Health equipment cleaning", "First aid kit packing"]
          },
          description: {
            placeholder: "e.g. Describe the non-clinical work and what is included.",
            helperText: "Describe what customers will receive."
          },
          options: {
            namePlaceholder: "e.g. Equipment type, Work type, Package",
            helperText: "Add customer choices such as Equipment type, Work type, Package, or enter your own.",
            suggestedOptions: [
              {
                key: "equipment-type",
                label: "Equipment type",
                aliases: [],
                namePlaceholder: "e.g. Equipment type",
                helperText: "Choose the values you actually offer; you can enter your own.",
                valuePlaceholder: "e.g. Thermometer, Blood pressure monitor, First aid kit",
                suggestedValues: [
                  "Thermometer",
                  "Blood pressure monitor",
                  "First aid kit"
                ]
              },
              {
                key: "work-type",
                label: "Work type",
                aliases: [],
                namePlaceholder: "e.g. Work type",
                helperText: "Choose the values you actually offer; you can enter your own.",
                valuePlaceholder: "e.g. Cleaning, Packing, Accessory replacement",
                suggestedValues: [
                  "Cleaning",
                  "Packing",
                  "Accessory replacement"
                ]
              },
              {
                key: "package",
                label: "Package",
                aliases: [],
                namePlaceholder: "e.g. Package",
                helperText: "Choose the values you actually offer; you can enter your own.",
                valuePlaceholder: "e.g. Basic, Standard, Extended",
                suggestedValues: ["Basic", "Standard", "Extended"]
              }
            ]
          }
        }
      },
      "hardware-building-materials": {
        product: {
          kind: "product",
          name: {
            placeholder: "e.g. Cement",
            examples: ["Cement", "Wall paint", "Electrical cable"]
          },
          description: {
            placeholder: "e.g. Describe the material, grade and specifications.",
            helperText: "Describe what customers will receive."
          },
          options: {
            namePlaceholder: "e.g. Grade, Colour, Finish",
            helperText: "Add customer choices such as Grade, Colour, Finish, or enter your own.",
            suggestedOptions: [
              {
                key: "grade",
                label: "Grade",
                aliases: [],
                namePlaceholder: "e.g. Grade",
                helperText: "Choose the values you actually offer; you can enter your own.",
                valuePlaceholder: "e.g. Standard, Premium, Heavy duty",
                suggestedValues: ["Standard", "Premium", "Heavy duty"]
              },
              {
                key: "colour",
                label: "Colour",
                aliases: ["Color"],
                namePlaceholder: "e.g. Colour",
                helperText: "Choose the values you actually offer; you can enter your own.",
                valuePlaceholder: "e.g. White, Grey, Blue",
                suggestedValues: ["White", "Grey", "Blue"]
              },
              {
                key: "finish",
                label: "Finish",
                aliases: [],
                namePlaceholder: "e.g. Finish",
                helperText: "Choose the values you actually offer; you can enter your own.",
                valuePlaceholder: "e.g. Matte, Gloss, Satin",
                suggestedValues: ["Matte", "Gloss", "Satin"]
              }
            ]
          },
          stockUnit: {
            placeholder: "e.g. Bag, Tin, Metre, Piece",
            helperText: "Choose the main unit you count this product in. Configure other selling units separately.",
            suggestions: ["Bag", "Tin", "Metre", "Piece"]
          }
        },
        service: {
          kind: "service",
          name: {
            placeholder: "e.g. Paint mixing",
            examples: ["Paint mixing", "Material cutting"]
          },
          description: {
            placeholder: "e.g. Describe the material preparation included.",
            helperText: "Describe what customers will receive."
          },
          options: {
            namePlaceholder: "e.g. Work type, Material, Finish",
            helperText: "Add customer choices such as Work type, Material, Finish, or enter your own.",
            suggestedOptions: [
              {
                key: "work-type",
                label: "Work type",
                aliases: [],
                namePlaceholder: "e.g. Work type",
                helperText: "Choose the values you actually offer; you can enter your own.",
                valuePlaceholder: "e.g. Mixing, Cutting, Preparation",
                suggestedValues: ["Mixing", "Cutting", "Preparation"]
              },
              {
                key: "material",
                label: "Material",
                aliases: [],
                namePlaceholder: "e.g. Material",
                helperText: "Choose the values you actually offer; you can enter your own.",
                valuePlaceholder: "e.g. Wood, Metal, Plastic",
                suggestedValues: ["Wood", "Metal", "Plastic"]
              },
              {
                key: "finish",
                label: "Finish",
                aliases: [],
                namePlaceholder: "e.g. Finish",
                helperText: "Choose the values you actually offer; you can enter your own.",
                valuePlaceholder: "e.g. Raw, Smooth, Polished",
                suggestedValues: ["Raw", "Smooth", "Polished"]
              }
            ]
          }
        }
      },
      "wholesale-distribution": {
        product: {
          kind: "product",
          name: {
            placeholder: "e.g. Wholesale rice",
            examples: ["Wholesale rice", "Cleaning supplies", "Packaged snacks"]
          },
          description: {
            placeholder: "e.g. Describe the item, brand and packaging.",
            helperText: "Describe what customers will receive."
          },
          options: {
            namePlaceholder: "e.g. Brand, Grade, Variety",
            helperText: "Add customer choices such as Brand, Grade, Variety, or enter your own.",
            suggestedOptions: [
              {
                key: "brand",
                label: "Brand",
                aliases: [],
                namePlaceholder: "e.g. Brand",
                helperText: "Choose the values you actually offer; you can enter your own.",
                valuePlaceholder: "e.g. Local brand, Store brand, Imported brand",
                suggestedValues: [
                  "Local brand",
                  "Store brand",
                  "Imported brand"
                ]
              },
              {
                key: "grade",
                label: "Grade",
                aliases: [],
                namePlaceholder: "e.g. Grade",
                helperText: "Choose the values you actually offer; you can enter your own.",
                valuePlaceholder: "e.g. Standard, Premium, Economy",
                suggestedValues: ["Standard", "Premium", "Economy"]
              },
              {
                key: "variety",
                label: "Variety",
                aliases: [],
                namePlaceholder: "e.g. Variety",
                helperText: "Choose the values you actually offer; you can enter your own.",
                valuePlaceholder: "e.g. Original, Flavoured, Mixed",
                suggestedValues: ["Original", "Flavoured", "Mixed"]
              }
            ]
          },
          stockUnit: {
            placeholder: "e.g. Piece, Bag, Kilogram, Bottle",
            helperText: "Choose the main unit you count this product in. Configure other selling units separately.",
            suggestions: ["Piece", "Bag", "Kilogram", "Bottle"]
          }
        },
        service: {
          kind: "service",
          name: {
            placeholder: "e.g. Order packing",
            examples: ["Order packing", "Goods labelling"]
          },
          description: {
            placeholder: "e.g. Describe the handling work included.",
            helperText: "Describe what customers will receive."
          },
          options: {
            namePlaceholder: "e.g. Work type, Packaging, Label type",
            helperText: "Add customer choices such as Work type, Packaging, Label type, or enter your own.",
            suggestedOptions: [
              {
                key: "work-type",
                label: "Work type",
                aliases: [],
                namePlaceholder: "e.g. Work type",
                helperText: "Choose the values you actually offer; you can enter your own.",
                valuePlaceholder: "e.g. Packing, Labelling, Sorting",
                suggestedValues: ["Packing", "Labelling", "Sorting"]
              },
              {
                key: "packaging",
                label: "Packaging",
                aliases: [],
                namePlaceholder: "e.g. Packaging",
                helperText: "Choose the values you actually offer; you can enter your own.",
                valuePlaceholder: "e.g. Box, Bag, Protective wrap",
                suggestedValues: ["Box", "Bag", "Protective wrap"]
              },
              {
                key: "label-type",
                label: "Label type",
                aliases: [],
                namePlaceholder: "e.g. Label type",
                helperText: "Choose the values you actually offer; you can enter your own.",
                valuePlaceholder: "e.g. Product label, Barcode label, Shipping label",
                suggestedValues: [
                  "Product label",
                  "Barcode label",
                  "Shipping label"
                ]
              }
            ]
          }
        }
      },
      "professional-services": {
        product: {
          kind: "product",
          name: {
            placeholder: "e.g. Printed workbook",
            examples: ["Printed workbook", "Training manual", "Design print"]
          },
          description: {
            placeholder: "e.g. Describe the printed material and edition.",
            helperText: "Describe what customers will receive."
          },
          options: {
            namePlaceholder: "e.g. Format, Edition, Language",
            helperText: "Add customer choices such as Format, Edition, Language, or enter your own.",
            suggestedOptions: [
              {
                key: "format",
                label: "Format",
                aliases: [],
                namePlaceholder: "e.g. Format",
                helperText: "Choose the values you actually offer; you can enter your own.",
                valuePlaceholder: "e.g. Workbook, Manual, Poster",
                suggestedValues: ["Workbook", "Manual", "Poster"]
              },
              {
                key: "edition",
                label: "Edition",
                aliases: [],
                namePlaceholder: "e.g. Edition",
                helperText: "Choose the values you actually offer; you can enter your own.",
                valuePlaceholder: "e.g. Standard, Revised, Instructor",
                suggestedValues: ["Standard", "Revised", "Instructor"]
              },
              {
                key: "language",
                label: "Language",
                aliases: [],
                namePlaceholder: "e.g. Language",
                helperText: "Choose the values you actually offer; you can enter your own.",
                valuePlaceholder: "e.g. English, Yoruba, Hausa",
                suggestedValues: ["English", "Yoruba", "Hausa"]
              }
            ]
          },
          stockUnit: {
            placeholder: "e.g. Piece, Book, Set",
            helperText: "Choose the main unit you count this product in. Configure other selling units separately.",
            suggestions: ["Piece", "Book", "Set"]
          }
        },
        service: {
          kind: "service",
          name: {
            placeholder: "e.g. Business consultation",
            examples: [
              "Business consultation",
              "Logo design",
              "Training session"
            ]
          },
          description: {
            placeholder: "e.g. Describe the scope, deliverables and session.",
            helperText: "Describe what customers will receive."
          },
          options: {
            namePlaceholder: "e.g. Package, Session format, Delivery format",
            helperText: "Add customer choices such as Package, Session format, Delivery format, or enter your own.",
            suggestedOptions: [
              {
                key: "package",
                label: "Package",
                aliases: [],
                namePlaceholder: "e.g. Package",
                helperText: "Choose the values you actually offer; you can enter your own.",
                valuePlaceholder: "e.g. Basic, Standard, Premium",
                suggestedValues: ["Basic", "Standard", "Premium"]
              },
              {
                key: "session-format",
                label: "Session format",
                aliases: [],
                namePlaceholder: "e.g. Session format",
                helperText: "Choose the values you actually offer; you can enter your own.",
                valuePlaceholder: "e.g. Remote, In-person",
                suggestedValues: ["Remote", "In-person"]
              },
              {
                key: "delivery-format",
                label: "Delivery format",
                aliases: [],
                namePlaceholder: "e.g. Delivery format",
                helperText: "Choose the values you actually offer; you can enter your own.",
                valuePlaceholder: "e.g. Digital, Printed, Digital and printed",
                suggestedValues: ["Digital", "Printed", "Digital and printed"]
              }
            ]
          }
        }
      },
      "other-mixed-business": {
        product: {
          kind: "product",
          name: {
            placeholder: "e.g. Your product name",
            examples: ["Your product name", "Handmade item"]
          },
          description: {
            placeholder: "e.g. Describe the item customers will receive.",
            helperText: "Describe what customers will receive."
          },
          options: {
            namePlaceholder: "e.g. Size, Colour, Material",
            helperText: "Add customer choices such as Size, Colour, Material, or enter your own.",
            suggestedOptions: [
              {
                key: "size",
                label: "Size",
                aliases: [],
                namePlaceholder: "e.g. Size",
                helperText: "Choose the values you actually offer; you can enter your own.",
                valuePlaceholder: "e.g. Small, Medium, Large",
                suggestedValues: ["Small", "Medium", "Large"]
              },
              {
                key: "colour",
                label: "Colour",
                aliases: ["Color"],
                namePlaceholder: "e.g. Colour",
                helperText: "Choose the values you actually offer; you can enter your own.",
                valuePlaceholder: "e.g. Black, White, Blue",
                suggestedValues: ["Black", "White", "Blue"]
              },
              {
                key: "material",
                label: "Material",
                aliases: [],
                namePlaceholder: "e.g. Material",
                helperText: "Choose the values you actually offer; you can enter your own.",
                valuePlaceholder: "e.g. Wood, Metal, Fabric",
                suggestedValues: ["Wood", "Metal", "Fabric"]
              }
            ]
          },
          stockUnit: {
            placeholder: "e.g. Piece, Kilogram, Litre",
            helperText: "Choose the main unit you count this product in. Configure other selling units separately.",
            suggestions: ["Piece", "Kilogram", "Litre"]
          }
        },
        service: {
          kind: "service",
          name: {
            placeholder: "e.g. Your service name",
            examples: ["Your service name", "Consultation"]
          },
          description: {
            placeholder: "e.g. Describe the work and what is included.",
            helperText: "Describe what customers will receive."
          },
          options: {
            namePlaceholder: "e.g. Package, Service level, Visit type",
            helperText: "Add customer choices such as Package, Service level, Visit type, or enter your own.",
            suggestedOptions: [
              {
                key: "package",
                label: "Package",
                aliases: [],
                namePlaceholder: "e.g. Package",
                helperText: "Choose the values you actually offer; you can enter your own.",
                valuePlaceholder: "e.g. Basic, Standard, Premium",
                suggestedValues: ["Basic", "Standard", "Premium"]
              },
              {
                key: "service-level",
                label: "Service level",
                aliases: [],
                namePlaceholder: "e.g. Service level",
                helperText: "Choose the values you actually offer; you can enter your own.",
                valuePlaceholder: "e.g. Standard, Express, Premium",
                suggestedValues: ["Standard", "Express", "Premium"]
              },
              {
                key: "visit-type",
                label: "Visit type",
                aliases: [],
                namePlaceholder: "e.g. Visit type",
                helperText: "Choose the values you actually offer; you can enter your own.",
                valuePlaceholder: "e.g. Remote, In-store, On-site",
                suggestedValues: ["Remote", "In-store", "On-site"]
              }
            ]
          }
        }
      }
    },
    byHelper: {
      "farm-eggs-tray": {
        kind: "product",
        name: {
          placeholder: "e.g. Eggs",
          examples: ["Eggs"]
        },
        description: {
          placeholder: "e.g. Fresh eggs collected from our farm.",
          helperText: "Describe what customers will receive."
        },
        options: {
          namePlaceholder: "e.g. Egg size, Grade",
          helperText: "Add customer choices such as Egg size, Grade, or enter your own.",
          suggestedOptions: [
            {
              key: "egg-size",
              label: "Egg size",
              aliases: ["Size"],
              namePlaceholder: "e.g. Egg size",
              helperText: "Choose the values you actually offer; you can enter your own.",
              valuePlaceholder: "e.g. Small, Medium, Large",
              suggestedValues: ["Small", "Medium", "Large"]
            },
            {
              key: "grade",
              label: "Grade",
              aliases: [],
              namePlaceholder: "e.g. Grade",
              helperText: "Choose the values you actually offer; you can enter your own.",
              valuePlaceholder: "e.g. Grade A, Grade B",
              suggestedValues: ["Grade A", "Grade B"]
            }
          ]
        },
        stockUnit: {
          placeholder: "e.g. Egg",
          helperText: "Choose the main unit you count this product in. Configure other selling units separately.",
          suggestions: ["Egg"]
        }
      },
      "farm-produce-weight": {
        kind: "product",
        name: {
          placeholder: "e.g. Farm Produce",
          examples: ["Farm Produce"]
        },
        description: {
          placeholder: "e.g. Describe the harvested produce and its grade.",
          helperText: "Describe what customers will receive."
        },
        options: {
          namePlaceholder: "e.g. Grade, Produce type",
          helperText: "Add customer choices such as Grade, Produce type, or enter your own.",
          suggestedOptions: [
            {
              key: "grade",
              label: "Grade",
              aliases: [],
              namePlaceholder: "e.g. Grade",
              helperText: "Choose the values you actually offer; you can enter your own.",
              valuePlaceholder: "e.g. Grade A, Grade B",
              suggestedValues: ["Grade A", "Grade B"]
            },
            {
              key: "produce-type",
              label: "Produce type",
              aliases: [],
              namePlaceholder: "e.g. Produce type",
              helperText: "Choose the values you actually offer; you can enter your own.",
              valuePlaceholder: "e.g. Tomato, Pepper, Maize",
              suggestedValues: ["Tomato", "Pepper", "Maize"]
            }
          ]
        },
        stockUnit: {
          placeholder: "e.g. Kilogram",
          helperText: "Choose the main unit you count this product in. Configure other selling units separately.",
          suggestions: ["Kilogram"]
        }
      },
      "drinks-bottle-crate": {
        kind: "product",
        name: {
          placeholder: "e.g. Bottled water",
          examples: ["Bottled water", "Orange juice", "Soft drink"]
        },
        description: {
          placeholder: "e.g. Describe the drink, flavour and packaging.",
          helperText: "Describe what customers will receive."
        },
        options: {
          namePlaceholder: "e.g. Flavour, Brand",
          helperText: "Add customer choices such as Flavour, Brand, or enter your own.",
          suggestedOptions: [
            {
              key: "flavour",
              label: "Flavour",
              aliases: [],
              namePlaceholder: "e.g. Flavour",
              helperText: "Choose the values you actually offer; you can enter your own.",
              valuePlaceholder: "e.g. Cola, Orange, Lemon",
              suggestedValues: ["Cola", "Orange", "Lemon"]
            },
            {
              key: "brand",
              label: "Brand",
              aliases: [],
              namePlaceholder: "e.g. Brand",
              helperText: "Choose the values you actually offer; you can enter your own.",
              valuePlaceholder: "e.g. Local brand, Store brand, Imported brand",
              suggestedValues: ["Local brand", "Store brand", "Imported brand"]
            }
          ]
        },
        stockUnit: {
          placeholder: "e.g. Bottle, Crate, Litre",
          helperText: "Choose the main unit you count this product in. Configure other selling units separately.",
          suggestions: ["Bottle", "Crate", "Litre"]
        }
      },
      "fabric-roll-metre": {
        kind: "product",
        name: {
          placeholder: "e.g. Ankara fabric",
          examples: ["Ankara fabric", "Cotton lining", "Sewing thread"]
        },
        description: {
          placeholder: "e.g. Describe the fabric, pattern and finish.",
          helperText: "Describe what customers will receive."
        },
        options: {
          namePlaceholder: "e.g. Material, Colour, Pattern",
          helperText: "Add customer choices such as Material, Colour, Pattern, or enter your own.",
          suggestedOptions: [
            {
              key: "material",
              label: "Material",
              aliases: [],
              namePlaceholder: "e.g. Material",
              helperText: "Choose the values you actually offer; you can enter your own.",
              valuePlaceholder: "e.g. Cotton, Linen, Silk",
              suggestedValues: ["Cotton", "Linen", "Silk", "Polyester"]
            },
            {
              key: "colour",
              label: "Colour",
              aliases: ["Color"],
              namePlaceholder: "e.g. Colour",
              helperText: "Choose the values you actually offer; you can enter your own.",
              valuePlaceholder: "e.g. Blue, Red, Black",
              suggestedValues: ["Blue", "Red", "Black", "White"]
            },
            {
              key: "pattern",
              label: "Pattern",
              aliases: [],
              namePlaceholder: "e.g. Pattern",
              helperText: "Choose the values you actually offer; you can enter your own.",
              valuePlaceholder: "e.g. Plain, Floral, Striped",
              suggestedValues: ["Plain", "Floral", "Striped", "Printed"]
            }
          ]
        },
        stockUnit: {
          placeholder: "e.g. Metre, Roll, Piece",
          helperText: "Choose the main unit you count this product in. Configure other selling units separately.",
          suggestions: ["Metre", "Roll", "Piece"]
        }
      },
      "rice-kilogram": {
        kind: "product",
        name: {
          placeholder: "e.g. Rice",
          examples: ["Rice", "Cooking oil", "Breakfast cereal"]
        },
        description: {
          placeholder: "e.g. Describe the variety, ingredients or packaging.",
          helperText: "Describe what customers will receive."
        },
        options: {
          namePlaceholder: "e.g. Brand, Variety, Grade",
          helperText: "Add customer choices such as Brand, Variety, Grade, or enter your own.",
          suggestedOptions: [
            {
              key: "brand",
              label: "Brand",
              aliases: [],
              namePlaceholder: "e.g. Brand",
              helperText: "Choose the values you actually offer; you can enter your own.",
              valuePlaceholder: "e.g. Local brand, Store brand, Imported brand",
              suggestedValues: ["Local brand", "Store brand", "Imported brand"]
            },
            {
              key: "variety",
              label: "Variety",
              aliases: [],
              namePlaceholder: "e.g. Variety",
              helperText: "Choose the values you actually offer; you can enter your own.",
              valuePlaceholder: "e.g. Long grain, Short grain, Brown rice",
              suggestedValues: ["Long grain", "Short grain", "Brown rice"]
            },
            {
              key: "grade",
              label: "Grade",
              aliases: [],
              namePlaceholder: "e.g. Grade",
              helperText: "Choose the values you actually offer; you can enter your own.",
              valuePlaceholder: "e.g. Standard, Premium",
              suggestedValues: ["Standard", "Premium"]
            }
          ]
        },
        stockUnit: {
          placeholder: "e.g. Piece, Kilogram, Litre",
          helperText: "Choose the main unit you count this product in. Configure other selling units separately.",
          suggestions: ["Piece", "Kilogram", "Litre"]
        }
      },
      "biscuits-piece-carton": {
        kind: "product",
        name: {
          placeholder: "e.g. Rice",
          examples: ["Rice", "Cooking oil", "Breakfast cereal"]
        },
        description: {
          placeholder: "e.g. Describe the variety, ingredients or packaging.",
          helperText: "Describe what customers will receive."
        },
        options: {
          namePlaceholder: "e.g. Flavour, Filling, Brand",
          helperText: "Add customer choices such as Flavour, Filling, Brand, or enter your own.",
          suggestedOptions: [
            {
              key: "flavour",
              label: "Flavour",
              aliases: [],
              namePlaceholder: "e.g. Flavour",
              helperText: "Choose the values you actually offer; you can enter your own.",
              valuePlaceholder: "e.g. Plain, Chocolate, Coconut",
              suggestedValues: ["Plain", "Chocolate", "Coconut"]
            },
            {
              key: "filling",
              label: "Filling",
              aliases: [],
              namePlaceholder: "e.g. Filling",
              helperText: "Choose the values you actually offer; you can enter your own.",
              valuePlaceholder: "e.g. No filling, Cream, Chocolate",
              suggestedValues: ["No filling", "Cream", "Chocolate"]
            },
            {
              key: "brand",
              label: "Brand",
              aliases: [],
              namePlaceholder: "e.g. Brand",
              helperText: "Choose the values you actually offer; you can enter your own.",
              valuePlaceholder: "e.g. Local brand, Store brand, Imported brand",
              suggestedValues: ["Local brand", "Store brand", "Imported brand"]
            }
          ]
        },
        stockUnit: {
          placeholder: "e.g. Piece, Kilogram, Litre",
          helperText: "Choose the main unit you count this product in. Configure other selling units separately.",
          suggestions: ["Piece", "Kilogram", "Litre"]
        }
      },
      "bottled-water-pack": {
        kind: "product",
        name: {
          placeholder: "e.g. Bottled water",
          examples: ["Bottled water", "Orange juice", "Soft drink"]
        },
        description: {
          placeholder: "e.g. Describe the drink, flavour and packaging.",
          helperText: "Describe what customers will receive."
        },
        options: {
          namePlaceholder: "e.g. Water type, Brand",
          helperText: "Add customer choices such as Water type, Brand, or enter your own.",
          suggestedOptions: [
            {
              key: "water-type",
              label: "Water type",
              aliases: [],
              namePlaceholder: "e.g. Water type",
              helperText: "Choose the values you actually offer; you can enter your own.",
              valuePlaceholder: "e.g. Still, Sparkling",
              suggestedValues: ["Still", "Sparkling"]
            },
            {
              key: "brand",
              label: "Brand",
              aliases: [],
              namePlaceholder: "e.g. Brand",
              helperText: "Choose the values you actually offer; you can enter your own.",
              valuePlaceholder: "e.g. Local brand, Store brand, Imported brand",
              suggestedValues: ["Local brand", "Store brand", "Imported brand"]
            }
          ]
        },
        stockUnit: {
          placeholder: "e.g. Bottle, Crate, Litre",
          helperText: "Choose the main unit you count this product in. Configure other selling units separately.",
          suggestions: ["Bottle", "Crate", "Litre"]
        }
      },
      "bandages-piece-box": {
        kind: "product",
        name: {
          placeholder: "e.g. Adhesive bandages",
          examples: [
            "Adhesive bandages",
            "Digital thermometer",
            "First aid kit"
          ]
        },
        description: {
          placeholder: "e.g. Describe the packaged item and manufacturer information.",
          helperText: "Describe what customers will receive."
        },
        options: {
          namePlaceholder: "e.g. Bandage type, Material, Size",
          helperText: "Add customer choices such as Bandage type, Material, Size, or enter your own.",
          suggestedOptions: [
            {
              key: "bandage-type",
              label: "Bandage type",
              aliases: [],
              namePlaceholder: "e.g. Bandage type",
              helperText: "Choose the values you actually offer; you can enter your own.",
              valuePlaceholder: "e.g. Adhesive, Gauze, Elastic",
              suggestedValues: ["Adhesive", "Gauze", "Elastic"]
            },
            {
              key: "material",
              label: "Material",
              aliases: [],
              namePlaceholder: "e.g. Material",
              helperText: "Choose the values you actually offer; you can enter your own.",
              valuePlaceholder: "e.g. Fabric, Plastic, Latex-free",
              suggestedValues: ["Fabric", "Plastic", "Latex-free"]
            },
            {
              key: "size",
              label: "Size",
              aliases: [],
              namePlaceholder: "e.g. Size",
              helperText: "Choose the values you actually offer; you can enter your own.",
              valuePlaceholder: "e.g. Small, Medium, Large",
              suggestedValues: ["Small", "Medium", "Large"]
            }
          ]
        },
        stockUnit: {
          placeholder: "e.g. Pack, Piece, Box",
          helperText: "Choose the main unit you count this product in. Configure other selling units separately.",
          suggestions: ["Pack", "Piece", "Box"]
        }
      },
      "cable-metre-roll": {
        kind: "product",
        name: {
          placeholder: "e.g. Cement",
          examples: ["Cement", "Wall paint", "Electrical cable"]
        },
        description: {
          placeholder: "e.g. Describe the material, grade and specifications.",
          helperText: "Describe what customers will receive."
        },
        options: {
          namePlaceholder: "e.g. Core type, Conductor, Colour",
          helperText: "Add customer choices such as Core type, Conductor, Colour, or enter your own.",
          suggestedOptions: [
            {
              key: "core-type",
              label: "Core type",
              aliases: [],
              namePlaceholder: "e.g. Core type",
              helperText: "Choose the values you actually offer; you can enter your own.",
              valuePlaceholder: "e.g. Single core, Multicore",
              suggestedValues: ["Single core", "Multicore"]
            },
            {
              key: "conductor",
              label: "Conductor",
              aliases: [],
              namePlaceholder: "e.g. Conductor",
              helperText: "Choose the values you actually offer; you can enter your own.",
              valuePlaceholder: "e.g. Copper, Aluminium",
              suggestedValues: ["Copper", "Aluminium"]
            },
            {
              key: "colour",
              label: "Colour",
              aliases: ["Color"],
              namePlaceholder: "e.g. Colour",
              helperText: "Choose the values you actually offer; you can enter your own.",
              valuePlaceholder: "e.g. Brown, Blue, Green and yellow",
              suggestedValues: ["Brown", "Blue", "Green and yellow"]
            }
          ]
        },
        stockUnit: {
          placeholder: "e.g. Bag, Tin, Metre, Piece",
          helperText: "Choose the main unit you count this product in. Configure other selling units separately.",
          suggestions: ["Bag", "Tin", "Metre", "Piece"]
        }
      },
      "wholesale-piece-pack-carton": {
        kind: "product",
        name: {
          placeholder: "e.g. Wholesale rice",
          examples: ["Wholesale rice", "Cleaning supplies", "Packaged snacks"]
        },
        description: {
          placeholder: "e.g. Describe the item, brand and packaging.",
          helperText: "Describe what customers will receive."
        },
        options: {
          namePlaceholder: "e.g. Brand, Grade, Variety",
          helperText: "Add customer choices such as Brand, Grade, Variety, or enter your own.",
          suggestedOptions: [
            {
              key: "brand",
              label: "Brand",
              aliases: [],
              namePlaceholder: "e.g. Brand",
              helperText: "Choose the values you actually offer; you can enter your own.",
              valuePlaceholder: "e.g. Local brand, Store brand, Imported brand",
              suggestedValues: ["Local brand", "Store brand", "Imported brand"]
            },
            {
              key: "grade",
              label: "Grade",
              aliases: [],
              namePlaceholder: "e.g. Grade",
              helperText: "Choose the values you actually offer; you can enter your own.",
              valuePlaceholder: "e.g. Standard, Premium, Economy",
              suggestedValues: ["Standard", "Premium", "Economy"]
            },
            {
              key: "variety",
              label: "Variety",
              aliases: [],
              namePlaceholder: "e.g. Variety",
              helperText: "Choose the values you actually offer; you can enter your own.",
              valuePlaceholder: "e.g. Original, Flavoured, Mixed",
              suggestedValues: ["Original", "Flavoured", "Mixed"]
            }
          ]
        },
        stockUnit: {
          placeholder: "e.g. Piece, Bag, Kilogram, Bottle",
          helperText: "Choose the main unit you count this product in. Configure other selling units separately.",
          suggestions: ["Piece", "Bag", "Kilogram", "Bottle"]
        }
      },
      "mixed-everyday-item": {
        kind: "product",
        name: {
          placeholder: "e.g. Your product name",
          examples: ["Your product name", "Handmade item"]
        },
        description: {
          placeholder: "e.g. Describe the item customers will receive.",
          helperText: "Describe what customers will receive."
        },
        options: {
          namePlaceholder: "e.g. Size, Colour, Material",
          helperText: "Add customer choices such as Size, Colour, Material, or enter your own.",
          suggestedOptions: [
            {
              key: "size",
              label: "Size",
              aliases: [],
              namePlaceholder: "e.g. Size",
              helperText: "Choose the values you actually offer; you can enter your own.",
              valuePlaceholder: "e.g. Small, Medium, Large",
              suggestedValues: ["Small", "Medium", "Large"]
            },
            {
              key: "colour",
              label: "Colour",
              aliases: ["Color"],
              namePlaceholder: "e.g. Colour",
              helperText: "Choose the values you actually offer; you can enter your own.",
              valuePlaceholder: "e.g. Black, White, Blue",
              suggestedValues: ["Black", "White", "Blue"]
            },
            {
              key: "material",
              label: "Material",
              aliases: [],
              namePlaceholder: "e.g. Material",
              helperText: "Choose the values you actually offer; you can enter your own.",
              valuePlaceholder: "e.g. Wood, Metal, Fabric",
              suggestedValues: ["Wood", "Metal", "Fabric"]
            }
          ]
        },
        stockUnit: {
          placeholder: "e.g. Piece, Kilogram, Litre",
          helperText: "Choose the main unit you count this product in. Configure other selling units separately.",
          suggestions: ["Piece", "Kilogram", "Litre"]
        }
      },
      "mixed-basic-service": {
        kind: "service",
        name: {
          placeholder: "e.g. Your service name",
          examples: ["Your service name", "Consultation"]
        },
        description: {
          placeholder: "e.g. Describe the work and what is included.",
          helperText: "Describe what customers will receive."
        },
        options: {
          namePlaceholder: "e.g. Package, Service level, Visit type",
          helperText: "Add customer choices such as Package, Service level, Visit type, or enter your own.",
          suggestedOptions: [
            {
              key: "package",
              label: "Package",
              aliases: [],
              namePlaceholder: "e.g. Package",
              helperText: "Choose the values you actually offer; you can enter your own.",
              valuePlaceholder: "e.g. Basic, Standard, Premium",
              suggestedValues: ["Basic", "Standard", "Premium"]
            },
            {
              key: "service-level",
              label: "Service level",
              aliases: [],
              namePlaceholder: "e.g. Service level",
              helperText: "Choose the values you actually offer; you can enter your own.",
              valuePlaceholder: "e.g. Standard, Express, Premium",
              suggestedValues: ["Standard", "Express", "Premium"]
            },
            {
              key: "visit-type",
              label: "Visit type",
              aliases: [],
              namePlaceholder: "e.g. Visit type",
              helperText: "Choose the values you actually offer; you can enter your own.",
              valuePlaceholder: "e.g. Remote, In-store, On-site",
              suggestedValues: ["Remote", "In-store", "On-site"]
            }
          ]
        }
      }
    }
  };
  // packages/utils/src/business-profiles.json
  var business_profiles_default = {
    schemaVersion: 1,
    profiles: [
      {
        key: "general-retail-groceries",
        title: "General retail and groceries",
        description: "Provision stores, mini-marts, supermarkets, and mixed everyday retail.",
        tags: ["retail", "grocery", "provisions", "supermarket", "shop"],
        recommendedItemKinds: ["product"],
        recommendedHelperKeys: [
          "counted-item",
          "shared-pack-carton",
          "measured-weight",
          "measured-volume"
        ]
      },
      {
        key: "animal-feed-agricultural-supplies",
        title: "Farming, animal feed and agricultural supplies",
        description: "Poultry farms, eggs, live birds, harvested produce, animal feed, seeds, fertilizer and farm supplies.",
        tags: [
          "feed",
          "poultry",
          "farm",
          "agriculture",
          "bag",
          "kilogram",
          "farming",
          "eggs",
          "birds",
          "harvest",
          "produce"
        ],
        recommendedItemKinds: ["product"],
        recommendedHelperKeys: [
          "farm-eggs-tray",
          "farm-live-poultry",
          "farm-produce-weight",
          "feed-bag-50kg",
          "feed-bag-25kg",
          "prepared-portions"
        ]
      },
      {
        key: "fashion-apparel",
        title: "Fashion and apparel",
        description: "Clothing, shoes, bags, accessories, and other size or colour-based goods.",
        tags: ["fashion", "apparel", "clothing", "shoes", "size", "colour"],
        recommendedItemKinds: ["product"],
        recommendedHelperKeys: [
          "apparel-size-colour",
          "counted-item",
          "shared-pack-carton"
        ]
      },
      {
        key: "fabrics-tailoring",
        title: "Fabrics and tailoring",
        description: "Fabric sellers, tailors, fashion designers, alterations, and made-to-measure work.",
        tags: [
          "fabric",
          "tailoring",
          "designer",
          "metre",
          "roll",
          "alteration"
        ],
        recommendedItemKinds: ["product", "service"],
        recommendedHelperKeys: [
          "fabric-roll-metre",
          "tracked-fixed-service",
          "tracked-quote-service"
        ]
      },
      {
        key: "drinks-water-distribution",
        title: "Drinks and water distribution",
        description: "Bottled water, soft drinks, beverages, depots, and crate-based sales.",
        tags: ["drinks", "water", "beverage", "bottle", "crate", "depot"],
        recommendedItemKinds: ["product"],
        recommendedHelperKeys: [
          "drinks-bottle-crate",
          "shared-pack-carton",
          "counted-item"
        ]
      },
      {
        key: "food-bakery-catering",
        title: "Food, bakery, and catering",
        description: "Restaurants, bakeries, caterers, meal vendors, and prepared food businesses.",
        tags: ["food", "restaurant", "bakery", "catering", "meal", "portion"],
        recommendedItemKinds: ["product", "service"],
        recommendedHelperKeys: [
          "counted-item",
          "measured-volume",
          "simple-fixed-service",
          "tracked-quote-service"
        ]
      },
      {
        key: "beauty-salon-spa",
        title: "Beauty, salon, barbershop, and spa",
        description: "Beauty products and fixed or tracked personal-care services.",
        tags: ["beauty", "cosmetics", "salon", "barber", "spa", "hair"],
        recommendedItemKinds: ["product", "service"],
        recommendedHelperKeys: [
          "counted-item",
          "simple-fixed-service",
          "tracked-fixed-service"
        ]
      },
      {
        key: "laundry-dry-cleaning",
        title: "Laundry and dry cleaning",
        description: "Garment washing, ironing, dry cleaning, express work, and pickup-ready services.",
        tags: [
          "laundry",
          "dry cleaning",
          "garment",
          "washing",
          "ironing",
          "express"
        ],
        recommendedItemKinds: ["service"],
        recommendedHelperKeys: ["dry-cleaning-laundry", "tracked-fixed-service"]
      },
      {
        key: "electronics-phone-shops",
        title: "Electronics and phone shops",
        description: "Phones, computers, accessories, appliances, and optional device repair work.",
        tags: [
          "electronics",
          "phone",
          "computer",
          "accessories",
          "appliance",
          "device"
        ],
        recommendedItemKinds: ["product", "service"],
        recommendedHelperKeys: [
          "phone-storage-colour",
          "charger-connector",
          "counted-item",
          "device-repair"
        ]
      },
      {
        key: "repair-maintenance",
        title: "Repair and maintenance",
        description: "Device, appliance, equipment, and general inspection or repair services.",
        tags: [
          "repair",
          "maintenance",
          "technician",
          "inspection",
          "quote",
          "parts"
        ],
        recommendedItemKinds: ["service", "product"],
        recommendedHelperKeys: [
          "device-repair",
          "tracked-quote-service",
          "tracked-fixed-service",
          "counted-item"
        ]
      },
      {
        key: "pharmacy-health-retail",
        title: "Pharmacy and health retail",
        description: "Medicine, wellness, personal-care, and other counted or packaged health goods.",
        tags: ["pharmacy", "medicine", "health", "wellness", "pack", "expiry"],
        recommendedItemKinds: ["product"],
        recommendedHelperKeys: ["counted-item", "shared-pack-carton"]
      },
      {
        key: "hardware-building-materials",
        title: "Hardware and building materials",
        description: "Cement, paint, pipes, electrical supplies, tools, and measured materials.",
        tags: ["hardware", "building", "cement", "paint", "length", "weight"],
        recommendedItemKinds: ["product"],
        recommendedHelperKeys: [
          "shared-pack-carton",
          "measured-length",
          "measured-weight",
          "measured-volume"
        ]
      },
      {
        key: "wholesale-distribution",
        title: "Wholesale and distribution",
        description: "Bulk sellers, distributors, depots, and businesses selling cartons, packs, and pieces.",
        tags: ["wholesale", "distribution", "bulk", "carton", "pack", "depot"],
        recommendedItemKinds: ["product"],
        recommendedHelperKeys: [
          "shared-pack-carton",
          "drinks-bottle-crate",
          "counted-item"
        ]
      },
      {
        key: "professional-services",
        title: "Professional services",
        description: "Consulting, accounting, legal, design, training, and other client work.",
        tags: [
          "consulting",
          "accounting",
          "legal",
          "design",
          "training",
          "quote"
        ],
        recommendedItemKinds: ["service"],
        recommendedHelperKeys: [
          "professional-consultation",
          "tracked-quote-service",
          "simple-fixed-service"
        ]
      },
      {
        key: "other-mixed-business",
        title: "Other or mixed business",
        description: "A business that spans several categories or is not listed yet.",
        tags: ["other", "mixed", "general", "custom", "multiple"],
        recommendedItemKinds: ["product", "service"],
        recommendedHelperKeys: ["counted-item", "simple-fixed-service"]
      }
    ]
  };
  // packages/utils/src/catalog-setup-helpers.json
  var catalog_setup_helpers_default = {
    schemaVersion: 1,
    helpers: [
      {
        key: "counted-item",
        kind: "product",
        classification: "pattern",
        title: "Counted item",
        description: "Sell and track a product as whole pieces.",
        tags: ["count", "piece", "single", "stock"],
        recommended: true,
        setup: {
          units: [
            {
              factor: "1",
              name: "Piece",
              stockBehavior: "canonical_shared",
              symbol: "pc",
              transactionScale: 0
            }
          ],
          optionGroups: []
        }
      },
      {
        key: "shared-pack-carton",
        kind: "product",
        classification: "pattern",
        title: "Piece, pack, and carton",
        description: "Price packs and cartons from one shared piece balance.",
        tags: ["piece", "pack", "carton", "shared stock", "dozen"],
        recommended: true,
        setup: {
          units: [
            {
              factor: "1",
              name: "Piece",
              stockBehavior: "canonical_shared",
              symbol: "pc",
              transactionScale: 0
            },
            {
              factor: "12",
              name: "Pack",
              stockBehavior: "alternate_transaction",
              transactionScale: 0
            },
            {
              factor: "144",
              name: "Carton",
              stockBehavior: "alternate_transaction",
              transactionScale: 0
            }
          ],
          optionGroups: []
        }
      },
      {
        key: "measured-weight",
        kind: "product",
        classification: "pattern",
        title: "Measured by weight",
        description: "Track kilograms and sell kilograms or grams from shared stock.",
        tags: ["weight", "kilogram", "kg", "gram", "measured"],
        recommended: true,
        setup: {
          units: [
            {
              factor: "1",
              name: "Kilogram",
              stockBehavior: "canonical_shared",
              symbol: "kg",
              transactionScale: 2
            },
            {
              factor: "0.001",
              name: "Gram",
              stockBehavior: "alternate_transaction",
              symbol: "g",
              transactionScale: 2
            }
          ],
          optionGroups: []
        }
      },
      {
        key: "measured-volume",
        kind: "product",
        classification: "pattern",
        title: "Measured by volume",
        description: "Track litres and sell litres or millilitres from shared stock.",
        tags: ["volume", "litre", "liter", "millilitre", "ml", "measured"],
        setup: {
          units: [
            {
              factor: "1",
              name: "Litre",
              stockBehavior: "canonical_shared",
              symbol: "L",
              transactionScale: 2
            },
            {
              factor: "0.001",
              name: "Millilitre",
              stockBehavior: "alternate_transaction",
              symbol: "mL",
              transactionScale: 2
            }
          ],
          optionGroups: []
        }
      },
      {
        key: "measured-length",
        kind: "product",
        classification: "pattern",
        title: "Measured by length",
        description: "Track metres and sell metres or centimetres from shared stock.",
        tags: ["length", "metre", "meter", "centimetre", "cm", "measured"],
        setup: {
          units: [
            {
              factor: "1",
              name: "Metre",
              stockBehavior: "canonical_shared",
              symbol: "m",
              transactionScale: 2
            },
            {
              factor: "0.01",
              name: "Centimetre",
              stockBehavior: "alternate_transaction",
              symbol: "cm",
              transactionScale: 2
            }
          ],
          optionGroups: []
        }
      },
      {
        key: "prepared-portions",
        kind: "product",
        classification: "pattern",
        title: "Whole, half, and quarter",
        description: "Keep prepared half and quarter portions as separate stock.",
        tags: ["whole", "half", "quarter", "portion", "prepared stock"],
        setup: {
          units: [
            {
              factor: "1",
              name: "Whole unit",
              stockBehavior: "canonical_shared",
              transactionScale: 0
            },
            {
              factor: "0.5",
              name: "Half unit",
              stockBehavior: "packaged_stock",
              transactionScale: 0
            },
            {
              factor: "0.25",
              name: "Quarter unit",
              stockBehavior: "packaged_stock",
              transactionScale: 0
            }
          ],
          optionGroups: []
        }
      },
      {
        key: "feed-bag-25kg",
        kind: "product",
        classification: "example",
        title: "25 kg chicken feed",
        description: "Starter, Grower, and Layer feed sold by prepared bag portions or kilograms.",
        tags: [
          "feed",
          "poultry",
          "chicken",
          "starter",
          "grower",
          "layer",
          "25kg"
        ],
        recommended: true,
        suggestedName: "Chicken Feed",
        setup: {
          units: [
            {
              factor: "1",
              name: "Bag",
              stockBehavior: "canonical_shared",
              symbol: "bag",
              transactionScale: 0
            },
            {
              factor: "0.5",
              name: "Half bag",
              stockBehavior: "packaged_stock",
              transactionScale: 0
            },
            {
              factor: "0.25",
              name: "Quarter bag",
              stockBehavior: "packaged_stock",
              transactionScale: 0
            },
            {
              factor: "0.04",
              name: "Kilogram",
              stockBehavior: "packaged_stock",
              symbol: "kg",
              transactionScale: 2
            }
          ],
          optionGroups: [
            {
              name: "Feed type",
              values: ["Starter", "Grower", "Layer"]
            }
          ]
        },
        businessProfileKeys: ["animal-feed-agricultural-supplies"]
      },
      {
        key: "feed-bag-50kg",
        kind: "product",
        classification: "example",
        title: "50 kg chicken feed",
        description: "Starter, Grower, and Layer feed sold by prepared bag portions or kilograms.",
        tags: [
          "feed",
          "poultry",
          "chicken",
          "starter",
          "grower",
          "layer",
          "50kg"
        ],
        recommended: true,
        suggestedName: "Chicken Feed",
        setup: {
          units: [
            {
              factor: "1",
              name: "Bag",
              stockBehavior: "canonical_shared",
              symbol: "bag",
              transactionScale: 0
            },
            {
              factor: "0.5",
              name: "Half bag",
              stockBehavior: "packaged_stock",
              transactionScale: 0
            },
            {
              factor: "0.25",
              name: "Quarter bag",
              stockBehavior: "packaged_stock",
              transactionScale: 0
            },
            {
              factor: "0.02",
              name: "Kilogram",
              stockBehavior: "packaged_stock",
              symbol: "kg",
              transactionScale: 2
            }
          ],
          optionGroups: [
            {
              name: "Feed type",
              values: ["Starter", "Grower", "Layer"]
            }
          ]
        },
        businessProfileKeys: ["animal-feed-agricultural-supplies"]
      },
      {
        key: "apparel-size-colour",
        kind: "product",
        classification: "example",
        title: "Apparel by size and colour",
        description: "A counted clothing item with independently priced size and colour combinations.",
        tags: ["apparel", "clothing", "fashion", "size", "colour", "color"],
        suggestedName: "Clothing Item",
        setup: {
          units: [
            {
              factor: "1",
              name: "Piece",
              stockBehavior: "canonical_shared",
              symbol: "pc",
              transactionScale: 0
            }
          ],
          optionGroups: [
            {
              name: "Size",
              values: ["S", "M", "L", "XL"]
            },
            {
              name: "Colour",
              values: ["Black", "White", "Blue"]
            }
          ]
        },
        businessProfileKeys: ["fashion-apparel"]
      },
      {
        key: "drinks-bottle-crate",
        kind: "product",
        classification: "example",
        title: "Drinks by bottle and crate",
        description: "Track bottles and keep unopened crates as separate prepared stock.",
        tags: ["drink", "beverage", "bottle", "crate", "soft drink"],
        suggestedName: "Soft Drink",
        setup: {
          units: [
            {
              factor: "1",
              name: "Bottle",
              stockBehavior: "canonical_shared",
              transactionScale: 0
            },
            {
              factor: "24",
              name: "Crate",
              stockBehavior: "packaged_stock",
              transactionScale: 0
            }
          ],
          optionGroups: []
        },
        businessProfileKeys: [
          "drinks-water-distribution",
          "wholesale-distribution"
        ]
      },
      {
        key: "fabric-roll-metre",
        kind: "product",
        classification: "example",
        title: "Fabric by roll and metre",
        description: "Sell measured fabric while unopened 50 metre rolls keep a separate balance.",
        tags: ["fabric", "textile", "roll", "metre", "meter", "cloth"],
        suggestedName: "Fabric",
        setup: {
          units: [
            {
              factor: "1",
              name: "Metre",
              stockBehavior: "canonical_shared",
              symbol: "m",
              transactionScale: 2
            },
            {
              factor: "0.01",
              name: "Centimetre",
              stockBehavior: "alternate_transaction",
              symbol: "cm",
              transactionScale: 2
            },
            {
              factor: "50",
              name: "Roll",
              stockBehavior: "packaged_stock",
              transactionScale: 0
            }
          ],
          optionGroups: []
        },
        businessProfileKeys: ["fabrics-tailoring"]
      },
      {
        key: "simple-fixed-service",
        kind: "service",
        classification: "pattern",
        title: "Simple fixed-price service",
        description: "Charge for a service without creating tracked work.",
        tags: ["simple", "fixed", "charge", "service"],
        recommended: true,
        setup: {
          authorizationPolicy: "on_order_confirmation",
          optionGroups: [],
          pricingPolicy: "fixed",
          quantityScale: 0,
          workPolicy: "charge_only"
        }
      },
      {
        key: "tracked-fixed-service",
        kind: "service",
        classification: "pattern",
        title: "Tracked fixed-price service",
        description: "Create work in the service queue after the order is confirmed.",
        tags: ["tracked", "fixed", "job", "work", "service"],
        recommended: true,
        setup: {
          authorizationPolicy: "on_order_confirmation",
          optionGroups: [],
          pricingPolicy: "fixed",
          quantityScale: 0,
          workPolicy: "tracked"
        }
      },
      {
        key: "tracked-quote-service",
        kind: "service",
        classification: "pattern",
        title: "Quote-required service",
        description: "Review the request and agree a price before tracked work begins.",
        tags: ["quote", "estimate", "tracked", "job", "service"],
        setup: {
          authorizationPolicy: "manual_release",
          optionGroups: [],
          pricingPolicy: "quote_required",
          quantityScale: 0,
          workPolicy: "tracked"
        }
      },
      {
        key: "dry-cleaning-laundry",
        kind: "service",
        classification: "example",
        title: "Dry cleaning and laundry",
        description: "Tracked garment care with independent garment, treatment, and size prices.",
        tags: ["dry cleaning", "laundry", "garment", "washing", "ironing"],
        recommended: true,
        suggestedName: "Dry Cleaning",
        setup: {
          authorizationPolicy: "on_order_confirmation",
          optionGroups: [
            {
              name: "Garment",
              values: [
                "Shirt",
                "Trousers",
                "Suit",
                "Caftan",
                "Agbada",
                "Jalabia",
                "Iro & Buba"
              ]
            },
            {
              name: "Treatment",
              values: ["Washing", "Ironing"]
            },
            {
              name: "Size",
              values: ["SM", "L"]
            }
          ],
          pricingPolicy: "fixed",
          quantityScale: 0,
          workPolicy: "tracked"
        },
        businessProfileKeys: ["laundry-dry-cleaning"]
      },
      {
        key: "device-repair",
        kind: "service",
        classification: "example",
        title: "Device repair",
        description: "Quote and track diagnosis or repair work by device type.",
        tags: ["device", "phone", "laptop", "tablet", "repair", "technician"],
        suggestedName: "Device Repair",
        setup: {
          authorizationPolicy: "manual_release",
          optionGroups: [
            {
              name: "Device",
              values: ["Phone", "Laptop", "Tablet"]
            },
            {
              name: "Work type",
              values: ["Diagnosis", "Repair"]
            }
          ],
          pricingPolicy: "quote_required",
          quantityScale: 0,
          workPolicy: "tracked"
        },
        businessProfileKeys: ["electronics-phone-shops", "repair-maintenance"]
      },
      {
        key: "professional-consultation",
        kind: "service",
        classification: "example",
        title: "Professional consultation",
        description: "Quote professional engagements delivered remotely or on-site.",
        tags: ["professional", "consultation", "advisory", "project", "quote"],
        suggestedName: "Professional Consultation",
        setup: {
          authorizationPolicy: "manual_release",
          optionGroups: [
            {
              name: "Engagement",
              values: ["Consultation", "Advisory", "Project"]
            },
            {
              name: "Delivery",
              values: ["Remote", "On-site"]
            }
          ],
          pricingPolicy: "quote_required",
          quantityScale: 0,
          workPolicy: "tracked"
        },
        businessProfileKeys: ["professional-services"]
      },
      {
        key: "farm-eggs-tray",
        kind: "product",
        classification: "example",
        title: "Eggs by piece and tray",
        description: "Track individual eggs and sell trays from the same balance. The example tray holds 30 eggs; edit it to match your farm.",
        suggestedName: "Eggs",
        businessProfileKeys: ["animal-feed-agricultural-supplies"],
        tags: ["farm", "poultry", "eggs", "layer", "tray"],
        setup: {
          units: [
            {
              name: "Egg",
              factor: "1",
              stockBehavior: "canonical_shared",
              transactionScale: 0
            },
            {
              name: "Tray",
              factor: "30",
              stockBehavior: "alternate_transaction",
              transactionScale: 0
            }
          ],
          optionGroups: []
        }
      },
      {
        key: "farm-live-poultry",
        kind: "product",
        classification: "example",
        title: "Live poultry by bird type",
        description: "Count live birds with separate stock and prices for broilers, layers and cockerels.",
        suggestedName: "Live Poultry",
        businessProfileKeys: ["animal-feed-agricultural-supplies"],
        tags: ["farm", "poultry", "bird", "broiler", "layer", "cockerel"],
        setup: {
          units: [
            {
              name: "Bird",
              factor: "1",
              stockBehavior: "canonical_shared",
              transactionScale: 0
            }
          ],
          optionGroups: [
            {
              name: "Bird type",
              values: ["Broiler", "Layer", "Cockerel"]
            }
          ]
        }
      },
      {
        key: "farm-produce-weight",
        kind: "product",
        classification: "example",
        title: "Farm produce by kilogram",
        description: "Weigh harvested produce and sell kilograms or grams from shared stock.",
        suggestedName: "Farm Produce",
        businessProfileKeys: [
          "animal-feed-agricultural-supplies",
          "general-retail-groceries"
        ],
        tags: ["farm", "harvest", "produce", "vegetables", "kilogram"],
        setup: {
          units: [
            {
              name: "Kilogram",
              factor: "1",
              stockBehavior: "canonical_shared",
              transactionScale: 2
            },
            {
              name: "Gram",
              factor: "0.001",
              stockBehavior: "alternate_transaction",
              transactionScale: 2
            }
          ],
          optionGroups: []
        }
      },
      {
        key: "fertilizer-bag",
        kind: "product",
        classification: "example",
        title: "Fertilizer by sealed bag",
        description: "Count sealed fertilizer bags with separate stock for each bag weight. Selling a bag does not open or divide it.",
        suggestedName: "Fertilizer",
        businessProfileKeys: ["animal-feed-agricultural-supplies"],
        tags: ["farm", "fertilizer", "bag", "agriculture"],
        setup: {
          units: [
            {
              name: "Bag",
              factor: "1",
              stockBehavior: "canonical_shared",
              transactionScale: 0
            }
          ],
          optionGroups: [
            {
              name: "Bag weight",
              values: ["25 kg", "50 kg"]
            }
          ]
        }
      },
      {
        key: "seed-packets",
        kind: "product",
        classification: "example",
        title: "Seed packets by crop",
        description: "Count seed packets with separate maize, tomato and pepper stock and prices.",
        suggestedName: "Seed Packet",
        businessProfileKeys: ["animal-feed-agricultural-supplies"],
        tags: ["farm", "seed", "packet", "maize", "tomato", "pepper"],
        setup: {
          units: [
            {
              name: "Packet",
              factor: "1",
              stockBehavior: "canonical_shared",
              transactionScale: 0
            }
          ],
          optionGroups: [
            {
              name: "Crop",
              values: ["Maize", "Tomato", "Pepper"]
            }
          ]
        }
      },
      {
        key: "rice-kilogram",
        kind: "product",
        classification: "example",
        title: "Rice by kilogram",
        description: "Track loose rice by kilogram and sell grams from the same balance.",
        suggestedName: "Rice",
        businessProfileKeys: [
          "general-retail-groceries",
          "food-bakery-catering"
        ],
        tags: ["rice", "groceries", "food", "kilogram", "gram"],
        setup: {
          units: [
            {
              name: "Kilogram",
              factor: "1",
              stockBehavior: "canonical_shared",
              transactionScale: 2
            },
            {
              name: "Gram",
              factor: "0.001",
              stockBehavior: "alternate_transaction",
              transactionScale: 2
            }
          ],
          optionGroups: []
        }
      },
      {
        key: "biscuits-piece-carton",
        kind: "product",
        classification: "example",
        title: "Biscuits by packet and carton",
        description: "Count biscuit packets and sell cartons from shared stock. Edit the example 24-packet carton quantity.",
        suggestedName: "Biscuits",
        businessProfileKeys: [
          "general-retail-groceries",
          "wholesale-distribution"
        ],
        tags: ["biscuit", "groceries", "packet", "carton"],
        setup: {
          units: [
            {
              name: "Packet",
              factor: "1",
              stockBehavior: "canonical_shared",
              transactionScale: 0
            },
            {
              name: "Carton",
              factor: "24",
              stockBehavior: "alternate_transaction",
              transactionScale: 0
            }
          ],
          optionGroups: []
        }
      },
      {
        key: "shoes-size",
        kind: "product",
        classification: "example",
        title: "Shoes by size",
        description: "Count pairs with separate stock and prices for each shoe size.",
        suggestedName: "Shoes",
        businessProfileKeys: ["fashion-apparel"],
        tags: ["shoes", "fashion", "pair", "size"],
        setup: {
          units: [
            {
              name: "Pair",
              factor: "1",
              stockBehavior: "canonical_shared",
              transactionScale: 0
            }
          ],
          optionGroups: [
            {
              name: "Size",
              values: ["38", "39", "40", "41", "42", "43"]
            }
          ]
        }
      },
      {
        key: "trouser-alteration",
        kind: "service",
        classification: "example",
        title: "Trouser alteration",
        description: "Track hemming, waist adjustments and zip replacements with an editable fixed price for each.",
        suggestedName: "Trouser Alteration",
        businessProfileKeys: ["fabrics-tailoring"],
        tags: ["tailoring", "alteration", "trousers", "hemming"],
        setup: {
          authorizationPolicy: "on_order_confirmation",
          pricingPolicy: "fixed",
          quantityScale: 0,
          workPolicy: "tracked",
          optionGroups: [
            {
              name: "Alteration",
              values: ["Hemming", "Waist adjustment", "Zip replacement"]
            }
          ]
        }
      },
      {
        key: "custom-outfit-sewing",
        kind: "service",
        classification: "example",
        title: "Custom outfit sewing",
        description: "Agree a quote for each outfit before releasing sewing work.",
        suggestedName: "Custom Outfit Sewing",
        businessProfileKeys: ["fabrics-tailoring"],
        tags: ["tailoring", "sewing", "outfit", "quote"],
        setup: {
          authorizationPolicy: "manual_release",
          pricingPolicy: "quote_required",
          quantityScale: 0,
          workPolicy: "tracked",
          optionGroups: [
            {
              name: "Outfit",
              values: ["Dress", "Suit", "Caftan"]
            }
          ]
        }
      },
      {
        key: "bottled-water-pack",
        kind: "product",
        classification: "example",
        title: "Bottled water by bottle and pack",
        description: "Count bottles and sell packs from shared stock. Edit the example 12-bottle pack quantity.",
        suggestedName: "Bottled Water",
        businessProfileKeys: [
          "drinks-water-distribution",
          "wholesale-distribution",
          "general-retail-groceries"
        ],
        tags: ["water", "bottle", "pack", "drinks"],
        setup: {
          units: [
            {
              name: "Bottle",
              factor: "1",
              stockBehavior: "canonical_shared",
              transactionScale: 0
            },
            {
              name: "Pack",
              factor: "12",
              stockBehavior: "alternate_transaction",
              transactionScale: 0
            }
          ],
          optionGroups: []
        }
      },
      {
        key: "bread-loaf-size",
        kind: "product",
        classification: "example",
        title: "Bread by loaf size",
        description: "Count loaves with separate stock and prices for each size.",
        suggestedName: "Bread",
        businessProfileKeys: [
          "food-bakery-catering",
          "general-retail-groceries"
        ],
        tags: ["bread", "bakery", "loaf", "food"],
        setup: {
          units: [
            {
              name: "Loaf",
              factor: "1",
              stockBehavior: "canonical_shared",
              transactionScale: 0
            }
          ],
          optionGroups: [
            {
              name: "Size",
              values: ["Small", "Medium", "Large"]
            }
          ]
        }
      },
      {
        key: "cake-size-flavour",
        kind: "product",
        classification: "example",
        title: "Cake by size and flavour",
        description: "Count ready-made cakes with independent stock and prices for every size and flavour.",
        suggestedName: "Cake",
        businessProfileKeys: ["food-bakery-catering"],
        tags: ["cake", "bakery", "size", "flavour"],
        setup: {
          units: [
            {
              name: "Cake",
              factor: "1",
              stockBehavior: "canonical_shared",
              transactionScale: 0
            }
          ],
          optionGroups: [
            {
              name: "Size",
              values: ["6 inch", "8 inch", "10 inch"]
            },
            {
              name: "Flavour",
              values: ["Vanilla", "Chocolate", "Red velvet"]
            }
          ]
        }
      },
      {
        key: "event-catering",
        kind: "service",
        classification: "example",
        title: "Event catering",
        description: "Quote and track event catering by package. Review scope and guest numbers with the customer before agreeing a price.",
        suggestedName: "Event Catering",
        businessProfileKeys: ["food-bakery-catering"],
        tags: ["food", "catering", "event", "quote"],
        setup: {
          authorizationPolicy: "manual_release",
          pricingPolicy: "quote_required",
          quantityScale: 0,
          workPolicy: "tracked",
          optionGroups: [
            {
              name: "Package",
              values: ["Food only", "Food and serving", "Full catering"]
            }
          ]
        }
      },
      {
        key: "shampoo-bottle-size",
        kind: "product",
        classification: "example",
        title: "Shampoo by bottle size",
        description: "Count sealed shampoo bottles with separate stock and prices for each volume.",
        suggestedName: "Shampoo",
        businessProfileKeys: ["beauty-salon-spa", "pharmacy-health-retail"],
        tags: ["shampoo", "hair", "beauty", "bottle"],
        setup: {
          units: [
            {
              name: "Bottle",
              factor: "1",
              stockBehavior: "canonical_shared",
              transactionScale: 0
            }
          ],
          optionGroups: [
            {
              name: "Bottle size",
              values: ["250 mL", "500 mL", "1 L"]
            }
          ]
        }
      },
      {
        key: "haircut-style",
        kind: "service",
        classification: "example",
        title: "Haircut by style",
        description: "Charge a fixed price for each haircut style without creating tracked service work.",
        suggestedName: "Haircut",
        businessProfileKeys: ["beauty-salon-spa"],
        tags: ["haircut", "barber", "salon", "style"],
        setup: {
          authorizationPolicy: "on_order_confirmation",
          pricingPolicy: "fixed",
          quantityScale: 0,
          workPolicy: "charge_only",
          optionGroups: [
            {
              name: "Style",
              values: ["Standard cut", "Fade", "Children cut"]
            }
          ]
        }
      },
      {
        key: "hair-braiding",
        kind: "service",
        classification: "example",
        title: "Hair braiding by style and length",
        description: "Track braiding work with an editable fixed price for each style and length.",
        suggestedName: "Hair Braiding",
        businessProfileKeys: ["beauty-salon-spa"],
        tags: ["hair", "braiding", "salon", "length"],
        setup: {
          authorizationPolicy: "on_order_confirmation",
          pricingPolicy: "fixed",
          quantityScale: 0,
          workPolicy: "tracked",
          optionGroups: [
            {
              name: "Style",
              values: ["Box braids", "Cornrows", "Twists"]
            },
            {
              name: "Length",
              values: ["Short", "Medium", "Long"]
            }
          ]
        }
      },
      {
        key: "ironing-only",
        kind: "service",
        classification: "example",
        title: "Ironing by garment",
        description: "Track ironing-only work with an editable fixed price for each garment.",
        suggestedName: "Ironing",
        businessProfileKeys: ["laundry-dry-cleaning"],
        tags: ["ironing", "garment", "laundry"],
        setup: {
          authorizationPolicy: "on_order_confirmation",
          pricingPolicy: "fixed",
          quantityScale: 0,
          workPolicy: "tracked",
          optionGroups: [
            {
              name: "Garment",
              values: ["Shirt", "Trousers", "Dress", "Caftan"]
            }
          ]
        }
      },
      {
        key: "phone-storage-colour",
        kind: "product",
        classification: "example",
        title: "Phone by storage and colour",
        description: "Count phones with separate stock and prices for every storage and colour combination.",
        suggestedName: "Phone",
        businessProfileKeys: ["electronics-phone-shops"],
        tags: ["phone", "electronics", "storage", "colour"],
        setup: {
          units: [
            {
              name: "Piece",
              factor: "1",
              stockBehavior: "canonical_shared",
              transactionScale: 0
            }
          ],
          optionGroups: [
            {
              name: "Storage",
              values: ["64 GB", "128 GB", "256 GB"]
            },
            {
              name: "Colour",
              values: ["Black", "Blue", "Silver"]
            }
          ]
        }
      },
      {
        key: "charger-connector",
        kind: "product",
        classification: "example",
        title: "Charger by connector type",
        description: "Count chargers with separate stock and prices for each connector.",
        suggestedName: "Charger",
        businessProfileKeys: ["electronics-phone-shops"],
        tags: ["charger", "electronics", "accessories", "connector"],
        setup: {
          units: [
            {
              name: "Piece",
              factor: "1",
              stockBehavior: "canonical_shared",
              transactionScale: 0
            }
          ],
          optionGroups: [
            {
              name: "Connector",
              values: ["USB-C", "Micro USB", "Lightning"]
            }
          ]
        }
      },
      {
        key: "appliance-repair",
        kind: "service",
        classification: "example",
        title: "Appliance diagnosis and repair",
        description: "Quote and track diagnosis or repair by appliance type.",
        suggestedName: "Appliance Repair",
        businessProfileKeys: ["repair-maintenance"],
        tags: ["appliance", "repair", "maintenance", "diagnosis"],
        setup: {
          authorizationPolicy: "manual_release",
          pricingPolicy: "quote_required",
          quantityScale: 0,
          workPolicy: "tracked",
          optionGroups: [
            {
              name: "Appliance",
              values: ["Refrigerator", "Washing machine", "Air conditioner"]
            },
            {
              name: "Work type",
              values: ["Diagnosis", "Repair"]
            }
          ]
        }
      },
      {
        key: "replacement-parts",
        kind: "product",
        classification: "example",
        title: "Replacement parts by type",
        description: "Count replacement parts with separate stock and prices for each type.",
        suggestedName: "Replacement Part",
        businessProfileKeys: [
          "repair-maintenance",
          "hardware-building-materials"
        ],
        tags: ["parts", "repair", "replacement", "hardware"],
        setup: {
          units: [
            {
              name: "Piece",
              factor: "1",
              stockBehavior: "canonical_shared",
              transactionScale: 0
            }
          ],
          optionGroups: [
            {
              name: "Part type",
              values: ["Belt", "Filter", "Switch"]
            }
          ]
        }
      },
      {
        key: "bandages-piece-box",
        kind: "product",
        classification: "example",
        title: "Bandages by piece and box",
        description: "Count individually wrapped bandages and sell boxes from shared stock. Edit the example 20-piece box quantity.",
        suggestedName: "Bandage",
        businessProfileKeys: ["pharmacy-health-retail"],
        tags: ["bandage", "health", "piece", "box"],
        setup: {
          units: [
            {
              name: "Piece",
              factor: "1",
              stockBehavior: "canonical_shared",
              transactionScale: 0
            },
            {
              name: "Box",
              factor: "20",
              stockBehavior: "alternate_transaction",
              transactionScale: 0
            }
          ],
          optionGroups: []
        }
      },
      {
        key: "wellness-pack-size",
        kind: "product",
        classification: "example",
        title: "Packaged wellness goods",
        description: "Count sealed wellness products with separate stock and prices for each pack size.",
        suggestedName: "Wellness Product",
        businessProfileKeys: ["pharmacy-health-retail"],
        tags: ["wellness", "health", "pack", "size"],
        setup: {
          units: [
            {
              name: "Pack",
              factor: "1",
              stockBehavior: "canonical_shared",
              transactionScale: 0
            }
          ],
          optionGroups: [
            {
              name: "Pack size",
              values: ["Small", "Large"]
            }
          ]
        }
      },
      {
        key: "cement-bag",
        kind: "product",
        classification: "example",
        title: "Cement by sealed bag",
        description: "Count sealed cement bags with separate stock and prices for each bag weight.",
        suggestedName: "Cement",
        businessProfileKeys: ["hardware-building-materials"],
        tags: ["cement", "building", "bag", "hardware"],
        setup: {
          units: [
            {
              name: "Bag",
              factor: "1",
              stockBehavior: "canonical_shared",
              transactionScale: 0
            }
          ],
          optionGroups: [
            {
              name: "Bag weight",
              values: ["25 kg", "50 kg"]
            }
          ]
        }
      },
      {
        key: "paint-tin-size-colour",
        kind: "product",
        classification: "example",
        title: "Paint by tin size and colour",
        description: "Count sealed paint tins with independent stock and prices for each size and colour.",
        suggestedName: "Paint",
        businessProfileKeys: ["hardware-building-materials"],
        tags: ["paint", "building", "tin", "colour"],
        setup: {
          units: [
            {
              name: "Tin",
              factor: "1",
              stockBehavior: "canonical_shared",
              transactionScale: 0
            }
          ],
          optionGroups: [
            {
              name: "Tin size",
              values: ["1 L", "4 L", "20 L"]
            },
            {
              name: "Colour",
              values: ["White", "Cream", "Grey"]
            }
          ]
        }
      },
      {
        key: "cable-metre-roll",
        kind: "product",
        classification: "example",
        title: "Cable by metre and roll",
        description: "Track loose cable in metres and keep unopened rolls as separate stock. Edit the example 100-metre roll length.",
        suggestedName: "Cable",
        businessProfileKeys: ["hardware-building-materials"],
        tags: ["cable", "electrical", "metre", "roll"],
        setup: {
          units: [
            {
              name: "Metre",
              factor: "1",
              stockBehavior: "canonical_shared",
              transactionScale: 2
            },
            {
              name: "Roll",
              factor: "100",
              stockBehavior: "packaged_stock",
              transactionScale: 0
            }
          ],
          optionGroups: []
        }
      },
      {
        key: "wholesale-piece-pack-carton",
        kind: "product",
        classification: "example",
        title: "Wholesale goods by piece, pack and carton",
        description: "Count individual pieces and sell packs and cartons from shared stock. Edit the example 12-piece pack and 144-piece carton quantities.",
        suggestedName: "Wholesale Goods",
        businessProfileKeys: ["wholesale-distribution"],
        tags: ["wholesale", "piece", "pack", "carton", "bulk"],
        setup: {
          units: [
            {
              name: "Piece",
              factor: "1",
              stockBehavior: "canonical_shared",
              transactionScale: 0
            },
            {
              name: "Pack",
              factor: "12",
              stockBehavior: "alternate_transaction",
              transactionScale: 0
            },
            {
              name: "Carton",
              factor: "144",
              stockBehavior: "alternate_transaction",
              transactionScale: 0
            }
          ],
          optionGroups: []
        }
      },
      {
        key: "design-project",
        kind: "service",
        classification: "example",
        title: "Design project by deliverable",
        description: "Agree a quote and track design work for each deliverable.",
        suggestedName: "Design Project",
        businessProfileKeys: ["professional-services"],
        tags: ["design", "professional", "project", "quote"],
        setup: {
          authorizationPolicy: "manual_release",
          pricingPolicy: "quote_required",
          quantityScale: 0,
          workPolicy: "tracked",
          optionGroups: [
            {
              name: "Deliverable",
              values: ["Logo", "Brand identity", "Website design"]
            }
          ]
        }
      },
      {
        key: "training-session",
        kind: "service",
        classification: "example",
        title: "Training session by format",
        description: "Track training sessions with an editable fixed price for each delivery format. Scheduling is configured separately.",
        suggestedName: "Training Session",
        businessProfileKeys: ["professional-services"],
        tags: ["training", "professional", "session", "delivery"],
        setup: {
          authorizationPolicy: "on_order_confirmation",
          pricingPolicy: "fixed",
          quantityScale: 0,
          workPolicy: "tracked",
          optionGroups: [
            {
              name: "Format",
              values: ["Remote", "On-site"]
            }
          ]
        }
      },
      {
        key: "mixed-everyday-item",
        kind: "product",
        classification: "example",
        title: "Everyday item by piece",
        description: "Start with a counted item, then rename it and add the options your business uses.",
        suggestedName: "Everyday Item",
        businessProfileKeys: ["other-mixed-business"],
        tags: ["mixed", "everyday", "piece", "general"],
        setup: {
          units: [
            {
              name: "Piece",
              factor: "1",
              stockBehavior: "canonical_shared",
              transactionScale: 0
            }
          ],
          optionGroups: []
        }
      },
      {
        key: "mixed-basic-service",
        kind: "service",
        classification: "example",
        title: "Basic service charge",
        description: "Start with a fixed service charge, then rename it and set your own price.",
        suggestedName: "Basic Service",
        businessProfileKeys: ["other-mixed-business"],
        tags: ["mixed", "basic", "service", "charge"],
        setup: {
          authorizationPolicy: "on_order_confirmation",
          pricingPolicy: "fixed",
          quantityScale: 0,
          workPolicy: "charge_only",
          optionGroups: []
        }
      }
    ]
  };

  // packages/utils/src/exact-decimal.ts
  var EXACT_CANONICAL_MAX_SCALE = 18;

  class ExactDecimalError extends Error {
    code;
    constructor(code, message) {
      super(message);
      this.name = "ExactDecimalError";
      this.code = code;
    }
  }
  var DECIMAL_PATTERN = /^-?\d+(?:\.\d+)?$/;
  var BIGINT_ZERO = BigInt(0);
  var BIGINT_TEN = BigInt(10);
  function assertScale(maxScale) {
    if (!Number.isInteger(maxScale) || maxScale < 0) {
      throw new RangeError("maxScale must be a non-negative integer.");
    }
  }
  function normalizeParts(parts) {
    let { coefficient, scale } = parts;
    if (coefficient === BIGINT_ZERO) {
      return { coefficient: BIGINT_ZERO, scale: 0 };
    }
    while (scale > 0 && coefficient % BIGINT_TEN === BIGINT_ZERO) {
      coefficient /= BIGINT_TEN;
      scale -= 1;
    }
    return { coefficient, scale };
  }
  function partsToString(parts) {
    const normalized = normalizeParts(parts);
    const negative = normalized.coefficient < BIGINT_ZERO;
    const digits = (negative ? -normalized.coefficient : normalized.coefficient).toString().padStart(normalized.scale + 1, "0");
    if (normalized.scale === 0) {
      return `${negative ? "-" : ""}${digits}`;
    }
    const whole = digits.slice(0, -normalized.scale);
    const fraction = digits.slice(-normalized.scale);
    return `${negative ? "-" : ""}${whole}.${fraction}`;
  }
  function exactDecimalParts(value) {
    const negative = value.startsWith("-");
    const unsigned = negative ? value.slice(1) : value;
    const [whole, fraction = ""] = unsigned.split(".");
    const coefficient = BigInt(`${whole}${fraction}`);
    return normalizeParts({
      coefficient: negative ? -coefficient : coefficient,
      scale: fraction.length
    });
  }
  function assertOutputScale(parts, maxScale) {
    const normalized = normalizeParts(parts);
    if (normalized.scale > maxScale) {
      throw new ExactDecimalError("SCALE_EXCEEDED", `Decimal result exceeds the maximum scale of ${maxScale}.`);
    }
    return normalized;
  }
  function parseExactDecimal(input, options = {}) {
    const value = input.trim();
    const maxScale = options.maxScale ?? EXACT_CANONICAL_MAX_SCALE;
    assertScale(maxScale);
    if (!DECIMAL_PATTERN.test(value)) {
      throw new ExactDecimalError("INVALID_DECIMAL", "Use a plain decimal string without exponent notation.");
    }
    const parts = exactDecimalParts(value);
    if (!options.allowNegative && parts.coefficient < BIGINT_ZERO) {
      throw new ExactDecimalError("NEGATIVE_NOT_ALLOWED", "A negative decimal is not allowed here.");
    }
    if (options.allowZero === false && parts.coefficient === BIGINT_ZERO) {
      throw new ExactDecimalError("ZERO_NOT_ALLOWED", "A value greater than zero is required.");
    }
    return partsToString(assertOutputScale(parts, maxScale));
  }

  // packages/utils/src/catalog-setup-helpers.ts
  var STOCK_BEHAVIORS = new Set([
    "alternate_transaction",
    "canonical_shared",
    "packaged_stock"
  ]);
  var AUTHORIZATION_POLICIES = new Set([
    "after_required_payment",
    "manual_release",
    "on_order_confirmation"
  ]);
  var PRICING_POLICIES = new Set(["fixed", "quote_required"]);
  var WORK_POLICIES = new Set(["charge_only", "tracked"]);
  function isRecord(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }
  function assertOnlyKeys(value, allowedKeys, field) {
    const allowed = new Set(allowedKeys);
    const unexpectedKey = Object.keys(value).find((key) => !allowed.has(key));
    if (unexpectedKey) {
      throw new Error(`Catalog setup helper ${field} contains unsupported field ${unexpectedKey}.`);
    }
  }
  function assertStringArray(value, field) {
    if (!Array.isArray(value) || value.length === 0 || value.some((entry) => typeof entry !== "string" || !entry.trim())) {
      throw new Error(`Catalog setup helper ${field} must be non-empty strings.`);
    }
  }
  function assertOptionGroups(value, helperKey) {
    if (!Array.isArray(value) || value.length > 12) {
      throw new Error(`Catalog setup helper ${helperKey} has invalid option groups.`);
    }
    let combinations = 1;
    for (const group of value) {
      if (!isRecord(group) || typeof group.name !== "string" || !group.name.trim()) {
        throw new Error(`Catalog setup helper ${helperKey} has an invalid option group.`);
      }
      assertOnlyKeys(group, ["name", "values"], `${helperKey} option group`);
      assertStringArray(group.values, `${helperKey} option values`);
      combinations *= group.values.length;
    }
    if (combinations > 96) {
      throw new Error(`Catalog setup helper ${helperKey} exceeds 96 combinations.`);
    }
  }
  function assertCommonHelper(helper) {
    assertOnlyKeys(helper, [
      "businessProfileKeys",
      "classification",
      "description",
      "key",
      "kind",
      "recommended",
      "setup",
      "suggestedName",
      "tags",
      "title"
    ], "entry");
    for (const field of ["description", "key", "title"]) {
      if (typeof helper[field] !== "string" || !helper[field].trim()) {
        throw new Error(`Catalog setup helper ${field} is required.`);
      }
    }
    if (helper.classification !== "pattern" && helper.classification !== "example") {
      throw new Error(`Catalog setup helper ${helper.key} has an invalid classification.`);
    }
    assertStringArray(helper.tags, `${helper.key} tags`);
    if (helper.businessProfileKeys !== undefined) {
      assertStringArray(helper.businessProfileKeys, `${helper.key} business profiles`);
      if (new Set(helper.businessProfileKeys).size !== helper.businessProfileKeys.length) {
        throw new Error(`${helper.key} has duplicate business profiles.`);
      }
    }
    if (helper.classification === "example" && !helper.businessProfileKeys) {
      throw new Error(`${helper.key} examples require business profiles.`);
    }
    if (helper.suggestedName !== undefined && (typeof helper.suggestedName !== "string" || !helper.suggestedName.trim())) {
      throw new Error(`Catalog setup helper ${helper.key} has an invalid suggested name.`);
    }
    if (helper.recommended !== undefined && typeof helper.recommended !== "boolean") {
      throw new Error(`Catalog setup helper ${helper.key} has an invalid recommendation.`);
    }
  }
  function assertProductSetup(setup, helperKey) {
    if (!isRecord(setup) || !Array.isArray(setup.units)) {
      throw new Error(`Product setup helper ${helperKey} requires units.`);
    }
    assertOnlyKeys(setup, ["optionGroups", "units"], `${helperKey} Product setup`);
    if (setup.units.length === 0 || setup.units.length > 48) {
      throw new Error(`Product setup helper ${helperKey} has an invalid unit count.`);
    }
    let canonicalCount = 0;
    for (const unit of setup.units) {
      if (!isRecord(unit) || typeof unit.name !== "string" || !unit.name.trim() || typeof unit.factor !== "string" || unit.symbol !== undefined && (typeof unit.symbol !== "string" || !unit.symbol.trim()) || !STOCK_BEHAVIORS.has(unit.stockBehavior) || !Number.isInteger(unit.transactionScale) || Number(unit.transactionScale) < 0 || Number(unit.transactionScale) > 6) {
        throw new Error(`Product setup helper ${helperKey} has an invalid unit.`);
      }
      assertOnlyKeys(unit, ["factor", "name", "stockBehavior", "symbol", "transactionScale"], `${helperKey} Product unit`);
      parseExactDecimal(unit.factor, { allowZero: false, maxScale: 12 });
      if (unit.stockBehavior === "canonical_shared") {
        canonicalCount += 1;
        if (unit.factor !== "1") {
          throw new Error(`Product setup helper ${helperKey} canonical factor must be 1.`);
        }
      }
    }
    if (canonicalCount !== 1) {
      throw new Error(`Product setup helper ${helperKey} requires one canonical unit.`);
    }
    if (setup.units[0]?.stockBehavior !== "canonical_shared") {
      throw new Error(`Product setup helper ${helperKey} must list its canonical unit first.`);
    }
    assertOptionGroups(setup.optionGroups, helperKey);
  }
  function assertServiceSetup(setup, helperKey) {
    if (!isRecord(setup) || !AUTHORIZATION_POLICIES.has(String(setup.authorizationPolicy)) || !PRICING_POLICIES.has(String(setup.pricingPolicy)) || !WORK_POLICIES.has(String(setup.workPolicy)) || !Number.isInteger(setup.quantityScale) || Number(setup.quantityScale) < 0 || Number(setup.quantityScale) > 6) {
      throw new Error(`Service setup helper ${helperKey} is invalid.`);
    }
    assertOnlyKeys(setup, [
      "authorizationPolicy",
      "optionGroups",
      "pricingPolicy",
      "quantityScale",
      "workPolicy"
    ], `${helperKey} Service setup`);
    assertOptionGroups(setup.optionGroups, helperKey);
  }
  function assertCatalogSetupHelperFile(value) {
    if (!isRecord(value) || value.schemaVersion !== 1 || !Array.isArray(value.helpers)) {
      throw new Error("Catalog setup helper file must use schema version 1.");
    }
    const keys = new Set;
    for (const helper of value.helpers) {
      if (!isRecord(helper)) {
        throw new Error("Catalog setup helper entries must be objects.");
      }
      assertCommonHelper(helper);
      if (keys.has(helper.key)) {
        throw new Error(`Catalog setup helper key ${helper.key} is duplicated.`);
      }
      keys.add(helper.key);
      if (helper.kind === "product") {
        assertProductSetup(helper.setup, helper.key);
      } else if (helper.kind === "service") {
        assertServiceSetup(helper.setup, helper.key);
      } else {
        throw new Error(`Catalog setup helper ${helper.key} has an invalid kind.`);
      }
    }
  }
  function deepFreeze(value) {
    if (Array.isArray(value)) {
      for (const entry of value)
        deepFreeze(entry);
    } else if (isRecord(value)) {
      for (const entry of Object.values(value))
        deepFreeze(entry);
    }
    return Object.freeze(value);
  }
  assertCatalogSetupHelperFile(catalog_setup_helpers_default);
  var CATALOG_SETUP_HELPER_SCHEMA_VERSION = catalog_setup_helpers_default.schemaVersion;
  var CATALOG_SETUP_HELPERS = deepFreeze(catalog_setup_helpers_default.helpers);
  function findCatalogSetupHelper(key) {
    return CATALOG_SETUP_HELPERS.find((helper) => helper.key === key);
  }

  // packages/utils/src/business-profiles.ts
  function isRecord2(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }
  function assertStringArray2(value, label) {
    if (!Array.isArray(value) || value.length === 0 || value.some((entry) => typeof entry !== "string" || !entry.trim())) {
      throw new Error(`${label} must be a non-empty string array.`);
    }
  }
  function assertBusinessProfileFile(value) {
    if (!isRecord2(value) || value.schemaVersion !== 1 || !Array.isArray(value.profiles)) {
      throw new Error("Business profile file must use schema version 1.");
    }
    const keys = new Set;
    for (const profile of value.profiles) {
      if (!isRecord2(profile) || typeof profile.key !== "string" || !profile.key.trim() || typeof profile.title !== "string" || !profile.title.trim() || typeof profile.description !== "string" || !profile.description.trim()) {
        throw new Error("Business profile entries require identity and copy.");
      }
      if (keys.has(profile.key)) {
        throw new Error(`Business profile key ${profile.key} is duplicated.`);
      }
      keys.add(profile.key);
      assertStringArray2(profile.tags, `${profile.key} tags`);
      assertStringArray2(profile.recommendedItemKinds, `${profile.key} recommended item kinds`);
      assertStringArray2(profile.recommendedHelperKeys, `${profile.key} recommended helpers`);
      for (const kind of profile.recommendedItemKinds) {
        if (kind !== "product" && kind !== "service") {
          throw new Error(`${profile.key} has an invalid recommended item kind.`);
        }
      }
      for (const helperKey of profile.recommendedHelperKeys) {
        const helper = findCatalogSetupHelper(helperKey);
        if (!helper) {
          throw new Error(`${profile.key} references unknown Catalog helper ${helperKey}.`);
        }
        if (!profile.recommendedItemKinds.includes(helper.kind)) {
          throw new Error(`${profile.key} recommends ${helperKey} without recommending ${helper.kind}.`);
        }
      }
    }
    for (const helper of CATALOG_SETUP_HELPERS) {
      for (const profileKey of helper.businessProfileKeys ?? []) {
        const profile = value.profiles.find((entry) => entry.key === profileKey);
        if (!profile || !profile.recommendedItemKinds.includes(helper.kind)) {
          throw new Error(`${helper.key} has an incompatible business profile ${profileKey}.`);
        }
      }
    }
  }
  function deepFreeze2(value) {
    if (Array.isArray(value)) {
      for (const entry of value)
        deepFreeze2(entry);
    } else if (isRecord2(value)) {
      for (const entry of Object.values(value))
        deepFreeze2(entry);
    }
    return Object.freeze(value);
  }
  assertBusinessProfileFile(business_profiles_default);
  var validatedProfileFile = business_profiles_default;
  var BUSINESS_PROFILE_SCHEMA_VERSION = business_profiles_default.schemaVersion;
  var BUSINESS_PROFILES = deepFreeze2(validatedProfileFile.profiles.map((profile) => {
    const examples = CATALOG_SETUP_HELPERS.filter((helper) => helper.businessProfileKeys?.includes(profile.key));
    const orderedExamples = [
      ...profile.recommendedHelperKeys.filter((key) => examples.some((helper) => helper.key === key)),
      ...examples.map((helper) => helper.key)
    ];
    const patterns = profile.recommendedHelperKeys.filter((key) => findCatalogSetupHelper(key)?.classification === "pattern");
    return {
      ...profile,
      recommendedHelperKeys: [...new Set([...orderedExamples, ...patterns])]
    };
  }));
  function findBusinessProfile(key) {
    if (!key)
      return;
    return BUSINESS_PROFILES.find((profile) => profile.key === key);
  }

  // packages/utils/src/business-catalog-guidance.ts
  function normalizeCatalogSuggestion(value) {
    return value.trim().replace(/\s+/g, " ").toLowerCase();
  }
  function record(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }
  function requireRecord(value, keys) {
    if (!record(value) || Object.keys(value).some((key) => !keys.includes(key)))
      throw new Error("Catalog guidance contains unsupported fields.");
  }
  function requireText(value, max = 240) {
    if (typeof value !== "string" || !value.trim() || value.length > max)
      throw new Error("Catalog guidance requires bounded, non-empty text.");
  }
  function requireTexts(value, max, allowEmpty = false) {
    if (!Array.isArray(value) || value.length > 100 || !allowEmpty && !value.length)
      throw new Error("Catalog guidance requires bounded example arrays.");
    const seen = new Set;
    for (const entry of value) {
      requireText(entry, max);
      const normalized = normalizeCatalogSuggestion(entry);
      if (seen.has(normalized))
        throw new Error("Catalog guidance repeats an example.");
      seen.add(normalized);
    }
  }
  function requireGuidance(value, kind) {
    requireRecord(value, [
      "kind",
      "name",
      "description",
      "options",
      ...kind === "product" ? ["stockUnit"] : []
    ]);
    if (value.kind !== kind)
      throw new Error("Catalog guidance has an incompatible item kind.");
    requireRecord(value.name, ["placeholder", "examples"]);
    requireText(value.name.placeholder);
    requireTexts(value.name.examples, 160);
    requireRecord(value.description, ["placeholder", "helperText"]);
    requireText(value.description.placeholder);
    requireText(value.description.helperText);
    requireRecord(value.options, [
      "namePlaceholder",
      "helperText",
      "suggestedOptions"
    ]);
    requireText(value.options.namePlaceholder);
    requireText(value.options.helperText);
    const options = value.options.suggestedOptions;
    if (!Array.isArray(options) || !options.length || options.length > 12)
      throw new Error("Catalog guidance requires option suggestions.");
    const keys = new Set;
    const names = new Set;
    for (const option of options) {
      requireRecord(option, [
        "key",
        "label",
        "aliases",
        "namePlaceholder",
        "helperText",
        "valuePlaceholder",
        "suggestedValues"
      ]);
      requireText(option.key, 120);
      requireText(option.label, 80);
      requireTexts(option.aliases, 80, true);
      requireText(option.namePlaceholder);
      requireText(option.helperText);
      requireText(option.valuePlaceholder);
      requireTexts(option.suggestedValues, 80);
      if (option.suggestedValues.some((entry) => entry.includes(",")))
        throw new Error("Catalog value examples cannot contain comma separators.");
      if (keys.has(option.key))
        throw new Error("Catalog guidance repeats an option key.");
      keys.add(option.key);
      for (const name of [option.label, ...option.aliases]) {
        const normalized = normalizeCatalogSuggestion(name);
        if (names.has(normalized))
          throw new Error("Catalog guidance has ambiguous option names.");
        names.add(normalized);
      }
    }
    if (kind === "product") {
      requireRecord(value.stockUnit, ["placeholder", "helperText", "suggestions"]);
      requireText(value.stockUnit.placeholder);
      requireText(value.stockUnit.helperText);
      requireTexts(value.stockUnit.suggestions, 80);
    }
  }
  function validateBusinessCatalogGuidance(value) {
    requireRecord(value, [
      "schemaVersion",
      "defaults",
      "byBusinessProfile",
      "byHelper"
    ]);
    if (value.schemaVersion !== 1)
      throw new Error("Catalog guidance must use schema version 1.");
    requireRecord(value.defaults, ["product", "service"]);
    requireGuidance(value.defaults.product, "product");
    requireGuidance(value.defaults.service, "service");
    if (!record(value.byBusinessProfile) || !record(value.byHelper))
      throw new Error("Catalog guidance requires profile and helper maps.");
    for (const key of Object.keys(value.byBusinessProfile)) {
      if (!findBusinessProfile(key))
        throw new Error(`Unknown Catalog guidance business profile: ${key}.`);
    }
    for (const profile of BUSINESS_PROFILES) {
      const entry = value.byBusinessProfile[profile.key];
      requireRecord(entry, ["product", "service"]);
      requireGuidance(entry.product, "product");
      requireGuidance(entry.service, "service");
    }
    for (const [key, entry] of Object.entries(value.byHelper)) {
      const helper = findCatalogSetupHelper(key);
      if (!helper)
        throw new Error(`Unknown Catalog guidance helper: ${key}.`);
      requireGuidance(entry, helper.kind);
    }
  }
  function freezeGuidance(value) {
    if (value && typeof value === "object") {
      for (const child of Object.values(value))
        freezeGuidance(child);
      Object.freeze(value);
    }
    return value;
  }
  validateBusinessCatalogGuidance(business_catalog_guidance_default);
  var BUSINESS_CATALOG_GUIDANCE = freezeGuidance(business_catalog_guidance_default);
  var DEFAULT_CATALOG_GUIDANCE = BUSINESS_CATALOG_GUIDANCE.defaults;
  function findCatalogOptionSuggestion(guidance, label) {
    const normalized = normalizeCatalogSuggestion(label);
    return guidance.options.suggestedOptions.find((option) => [option.label, ...option.aliases].some((name) => normalizeCatalogSuggestion(name) === normalized));
  }
  function resolveCatalogFormGuidance({
    businessProfileKey,
    kind,
    selectedHelperKey
  }) {
    const profile = findBusinessProfile(businessProfileKey);
    const base = (profile ? BUSINESS_CATALOG_GUIDANCE.byBusinessProfile[profile.key]?.[kind] : undefined) ?? DEFAULT_CATALOG_GUIDANCE[kind];
    const helper = selectedHelperKey ? findCatalogSetupHelper(selectedHelperKey) : undefined;
    if (!helper || helper.kind !== kind)
      return base;
    const helperProfileKey = helper.businessProfileKeys?.[0];
    const specific = BUSINESS_CATALOG_GUIDANCE.byHelper[helper.key] ?? (helperProfileKey ? BUSINESS_CATALOG_GUIDANCE.byBusinessProfile[helperProfileKey]?.[kind] : undefined) ?? base;
    const recipeOptions = helper.setup.optionGroups.map((group, index) => {
      const matching = findCatalogOptionSuggestion(specific, group.name);
      return {
        key: `helper:${helper.key}:${index}`,
        label: group.name,
        aliases: matching?.aliases.filter((alias) => normalizeCatalogSuggestion(alias) !== normalizeCatalogSuggestion(group.name)) ?? [],
        namePlaceholder: `e.g. ${group.name}`,
        helperText: matching?.helperText ?? "Choose the values you actually offer.",
        valuePlaceholder: `e.g. ${group.values.slice(0, 3).join(", ")}`,
        suggestedValues: [...group.values]
      };
    });
    const resolved = {
      ...specific,
      name: helper.suggestedName ? {
        placeholder: `e.g. ${helper.suggestedName}`,
        examples: [helper.suggestedName]
      } : specific.name,
      options: recipeOptions.length ? {
        namePlaceholder: `e.g. ${recipeOptions.map((option) => option.label).slice(0, 3).join(", ")}`,
        helperText: "Add the customer choices relevant to this item.",
        suggestedOptions: recipeOptions
      } : specific.options
    };
    if (helper.kind === "product") {
      return freezeGuidance({
        ...resolved,
        kind: "product",
        stockUnit: {
          placeholder: `e.g. ${helper.setup.units[0]?.name ?? "Piece"}`,
          helperText: "Use the main unit configured by this setup. Additional selling units are configured separately.",
          suggestions: [helper.setup.units[0]?.name ?? "Piece"]
        }
      });
    }
    return freezeGuidance({ ...resolved, kind: "service", stockUnit: undefined });
  }
  function getCatalogOptionSuggestions(guidance, {
    query = "",
    usedNames = [],
    limit = 5
  } = {}) {
    const used = new Set(usedNames.map((name) => findCatalogOptionSuggestion(guidance, name)?.key).filter(Boolean));
    const available = guidance.options.suggestedOptions.filter((option) => !used.has(option.key));
    const search = normalizeCatalogSuggestion(query);
    const matches = search ? available.filter((option) => [option.label, ...option.aliases].some((name) => normalizeCatalogSuggestion(name).includes(search))) : available;
    return matches.slice(0, limit);
  }
  function getCatalogOptionValueSuggestions(guidance, label, {
    query = "",
    selectedValues = [],
    limit = 5
  } = {}) {
    const selected = new Set(selectedValues.map(normalizeCatalogSuggestion));
    const search = normalizeCatalogSuggestion(query);
    return (findCatalogOptionSuggestion(guidance, label)?.suggestedValues ?? []).filter((value) => !selected.has(normalizeCatalogSuggestion(value)) && (!search || normalizeCatalogSuggestion(value).includes(search))).slice(0, limit);
  }
  function getCatalogOptionValueHint(guidance, label) {
    const values = getCatalogOptionValueSuggestions(guidance, label, { limit: 3 });
    return values.length ? `Try ${values.join(", ")}, or your own value.` : "Add your own customer choices for this option.";
  }
  // packages/utils/src/catalog-category-presets.json
  var catalog_category_presets_default = {
    schemaVersion: 1,
    categories: [
      {
        key: "poultry",
        label: "Poultry",
        itemKinds: ["product"],
        businessProfileKeys: [
          "animal-feed-agricultural-supplies",
          "general-retail-groceries",
          "wholesale-distribution"
        ],
        subcategories: [
          {
            key: "poultry:eggs",
            label: "Eggs"
          },
          {
            key: "poultry:live-birds",
            label: "Live birds"
          },
          {
            key: "poultry:dressed-poultry",
            label: "Dressed poultry"
          },
          {
            key: "poultry:hatching-eggs",
            label: "Hatching eggs"
          }
        ]
      },
      {
        key: "animal-feed",
        label: "Animal feed",
        itemKinds: ["product"],
        businessProfileKeys: [
          "animal-feed-agricultural-supplies",
          "wholesale-distribution"
        ],
        subcategories: [
          {
            key: "animal-feed:poultry-feed",
            label: "Poultry feed"
          },
          {
            key: "animal-feed:fish-feed",
            label: "Fish feed"
          },
          {
            key: "animal-feed:livestock-feed",
            label: "Livestock feed"
          },
          {
            key: "animal-feed:pet-food",
            label: "Pet food"
          }
        ]
      },
      {
        key: "farm-supplies",
        label: "Farm supplies",
        itemKinds: ["product"],
        businessProfileKeys: [
          "animal-feed-agricultural-supplies",
          "hardware-building-materials",
          "wholesale-distribution"
        ],
        subcategories: [
          {
            key: "farm-supplies:seeds",
            label: "Seeds"
          },
          {
            key: "farm-supplies:fertilizers",
            label: "Fertilizers"
          },
          {
            key: "farm-supplies:farm-tools",
            label: "Farm tools"
          },
          {
            key: "farm-supplies:packaging",
            label: "Packaging"
          }
        ]
      },
      {
        key: "fresh-produce",
        label: "Fresh produce",
        itemKinds: ["product"],
        businessProfileKeys: [
          "animal-feed-agricultural-supplies",
          "general-retail-groceries",
          "food-bakery-catering",
          "wholesale-distribution"
        ],
        subcategories: [
          {
            key: "fresh-produce:vegetables",
            label: "Vegetables"
          },
          {
            key: "fresh-produce:fruit",
            label: "Fruit"
          },
          {
            key: "fresh-produce:tubers",
            label: "Tubers"
          },
          {
            key: "fresh-produce:herbs",
            label: "Herbs"
          }
        ]
      },
      {
        key: "groceries",
        label: "Groceries",
        itemKinds: ["product"],
        businessProfileKeys: [
          "general-retail-groceries",
          "wholesale-distribution",
          "food-bakery-catering"
        ],
        subcategories: [
          {
            key: "groceries:grains-flour",
            label: "Grains and flour"
          },
          {
            key: "groceries:cooking-ingredients",
            label: "Cooking ingredients"
          },
          {
            key: "groceries:canned-food",
            label: "Canned food"
          },
          {
            key: "groceries:snacks",
            label: "Snacks"
          }
        ]
      },
      {
        key: "drinks-water",
        label: "Drinks and water",
        itemKinds: ["product"],
        businessProfileKeys: [
          "drinks-water-distribution",
          "general-retail-groceries",
          "food-bakery-catering",
          "wholesale-distribution"
        ],
        subcategories: [
          {
            key: "drinks-water:drinking-water",
            label: "Drinking water"
          },
          {
            key: "drinks-water:soft-drinks",
            label: "Soft drinks"
          },
          {
            key: "drinks-water:juice",
            label: "Juice"
          },
          {
            key: "drinks-water:tea-coffee",
            label: "Tea and coffee"
          }
        ]
      },
      {
        key: "bakery-prepared-food",
        label: "Bakery and prepared food",
        itemKinds: ["product"],
        businessProfileKeys: [
          "food-bakery-catering",
          "general-retail-groceries"
        ],
        subcategories: [
          {
            key: "bakery-prepared-food:bread",
            label: "Bread"
          },
          {
            key: "bakery-prepared-food:cakes",
            label: "Cakes"
          },
          {
            key: "bakery-prepared-food:pastries",
            label: "Pastries"
          },
          {
            key: "bakery-prepared-food:ready-meals",
            label: "Ready meals"
          }
        ]
      },
      {
        key: "clothing",
        label: "Clothing",
        itemKinds: ["product"],
        businessProfileKeys: [
          "fashion-apparel",
          "fabrics-tailoring",
          "wholesale-distribution"
        ],
        subcategories: [
          {
            key: "clothing:womenswear",
            label: "Womenswear"
          },
          {
            key: "clothing:menswear",
            label: "Menswear"
          },
          {
            key: "clothing:childrenswear",
            label: "Childrenswear"
          },
          {
            key: "clothing:workwear",
            label: "Workwear"
          }
        ]
      },
      {
        key: "footwear-accessories",
        label: "Footwear and accessories",
        itemKinds: ["product"],
        businessProfileKeys: [
          "fashion-apparel",
          "general-retail-groceries",
          "wholesale-distribution"
        ],
        subcategories: [
          {
            key: "footwear-accessories:shoes",
            label: "Shoes"
          },
          {
            key: "footwear-accessories:bags",
            label: "Bags"
          },
          {
            key: "footwear-accessories:jewellery",
            label: "Jewellery"
          },
          {
            key: "footwear-accessories:accessories",
            label: "Accessories"
          }
        ]
      },
      {
        key: "fabrics-sewing",
        label: "Fabrics and sewing supplies",
        itemKinds: ["product"],
        businessProfileKeys: [
          "fabrics-tailoring",
          "fashion-apparel",
          "wholesale-distribution"
        ],
        subcategories: [
          {
            key: "fabrics-sewing:fabric",
            label: "Fabric"
          },
          {
            key: "fabrics-sewing:thread-notions",
            label: "Thread and notions"
          },
          {
            key: "fabrics-sewing:patterns",
            label: "Patterns"
          },
          {
            key: "fabrics-sewing:sewing-tools",
            label: "Sewing tools"
          }
        ]
      },
      {
        key: "beauty-personal-care",
        label: "Beauty and personal care",
        itemKinds: ["product"],
        businessProfileKeys: [
          "beauty-salon-spa",
          "general-retail-groceries",
          "pharmacy-health-retail",
          "wholesale-distribution"
        ],
        subcategories: [
          {
            key: "beauty-personal-care:hair-care",
            label: "Hair care"
          },
          {
            key: "beauty-personal-care:skin-care",
            label: "Skin care"
          },
          {
            key: "beauty-personal-care:cosmetics",
            label: "Cosmetics"
          },
          {
            key: "beauty-personal-care:personal-hygiene",
            label: "Personal hygiene"
          }
        ]
      },
      {
        key: "health-wellness",
        label: "Health and wellness",
        itemKinds: ["product"],
        businessProfileKeys: [
          "pharmacy-health-retail",
          "general-retail-groceries",
          "wholesale-distribution"
        ],
        subcategories: [
          {
            key: "health-wellness:health-supplies",
            label: "Health supplies"
          },
          {
            key: "health-wellness:wellness-products",
            label: "Wellness products"
          },
          {
            key: "health-wellness:first-aid",
            label: "First aid"
          },
          {
            key: "health-wellness:medical-equipment",
            label: "Medical equipment"
          }
        ]
      },
      {
        key: "electronics",
        label: "Electronics",
        itemKinds: ["product"],
        businessProfileKeys: [
          "electronics-phone-shops",
          "repair-maintenance",
          "wholesale-distribution"
        ],
        subcategories: [
          {
            key: "electronics:phones",
            label: "Phones"
          },
          {
            key: "electronics:computers",
            label: "Computers"
          },
          {
            key: "electronics:accessories",
            label: "Accessories"
          },
          {
            key: "electronics:appliances",
            label: "Appliances"
          }
        ]
      },
      {
        key: "hardware-building",
        label: "Hardware and building materials",
        itemKinds: ["product"],
        businessProfileKeys: [
          "hardware-building-materials",
          "repair-maintenance",
          "wholesale-distribution"
        ],
        subcategories: [
          {
            key: "hardware-building:hand-tools",
            label: "Hand tools"
          },
          {
            key: "hardware-building:electrical-supplies",
            label: "Electrical supplies"
          },
          {
            key: "hardware-building:plumbing-supplies",
            label: "Plumbing supplies"
          },
          {
            key: "hardware-building:building-materials",
            label: "Building materials"
          }
        ]
      },
      {
        key: "home-household",
        label: "Home and household",
        itemKinds: ["product"],
        businessProfileKeys: [
          "general-retail-groceries",
          "hardware-building-materials",
          "wholesale-distribution"
        ],
        subcategories: [
          {
            key: "home-household:cleaning-supplies",
            label: "Cleaning supplies"
          },
          {
            key: "home-household:kitchenware",
            label: "Kitchenware"
          },
          {
            key: "home-household:home-textiles",
            label: "Home textiles"
          },
          {
            key: "home-household:furniture",
            label: "Furniture"
          }
        ]
      },
      {
        key: "spare-parts",
        label: "Spare parts",
        itemKinds: ["product"],
        businessProfileKeys: [
          "repair-maintenance",
          "electronics-phone-shops",
          "hardware-building-materials",
          "wholesale-distribution"
        ],
        subcategories: [
          {
            key: "spare-parts:vehicle-parts",
            label: "Vehicle parts"
          },
          {
            key: "spare-parts:appliance-parts",
            label: "Appliance parts"
          },
          {
            key: "spare-parts:phone-parts",
            label: "Phone parts"
          },
          {
            key: "spare-parts:machine-parts",
            label: "Machine parts"
          }
        ]
      },
      {
        key: "tailoring-services",
        label: "Tailoring services",
        itemKinds: ["service"],
        businessProfileKeys: [
          "fabrics-tailoring",
          "fashion-apparel",
          "professional-services"
        ],
        subcategories: [
          {
            key: "tailoring-services:custom-sewing",
            label: "Custom sewing"
          },
          {
            key: "tailoring-services:alterations",
            label: "Alterations"
          },
          {
            key: "tailoring-services:repairs",
            label: "Repairs"
          },
          {
            key: "tailoring-services:embroidery",
            label: "Embroidery"
          }
        ]
      },
      {
        key: "beauty-services",
        label: "Beauty services",
        itemKinds: ["service"],
        businessProfileKeys: ["beauty-salon-spa", "professional-services"],
        subcategories: [
          {
            key: "beauty-services:hair-services",
            label: "Hair services"
          },
          {
            key: "beauty-services:nail-services",
            label: "Nail services"
          },
          {
            key: "beauty-services:skin-treatments",
            label: "Skin treatments"
          },
          {
            key: "beauty-services:spa-treatments",
            label: "Spa treatments"
          }
        ]
      },
      {
        key: "clothing-care",
        label: "Laundry and clothing care",
        itemKinds: ["service"],
        businessProfileKeys: [
          "laundry-dry-cleaning",
          "fabrics-tailoring",
          "fashion-apparel"
        ],
        subcategories: [
          {
            key: "clothing-care:laundry",
            label: "Laundry"
          },
          {
            key: "clothing-care:dry-cleaning",
            label: "Dry cleaning"
          },
          {
            key: "clothing-care:ironing",
            label: "Ironing"
          },
          {
            key: "clothing-care:specialist-cleaning",
            label: "Specialist cleaning"
          }
        ]
      },
      {
        key: "repair-services",
        label: "Repair and maintenance",
        itemKinds: ["service"],
        businessProfileKeys: [
          "repair-maintenance",
          "electronics-phone-shops",
          "hardware-building-materials",
          "professional-services"
        ],
        subcategories: [
          {
            key: "repair-services:phone-repairs",
            label: "Phone repairs"
          },
          {
            key: "repair-services:appliance-repairs",
            label: "Appliance repairs"
          },
          {
            key: "repair-services:vehicle-servicing",
            label: "Vehicle servicing"
          },
          {
            key: "repair-services:property-maintenance",
            label: "Property maintenance"
          }
        ]
      },
      {
        key: "food-services",
        label: "Food and catering services",
        itemKinds: ["service"],
        businessProfileKeys: ["food-bakery-catering", "professional-services"],
        subcategories: [
          {
            key: "food-services:catering",
            label: "Catering"
          },
          {
            key: "food-services:meal-preparation",
            label: "Meal preparation"
          },
          {
            key: "food-services:event-service",
            label: "Event service"
          },
          {
            key: "food-services:baking-services",
            label: "Baking services"
          }
        ]
      },
      {
        key: "professional-services",
        label: "Professional services",
        itemKinds: ["service"],
        businessProfileKeys: ["professional-services", "other-mixed-business"],
        subcategories: [
          {
            key: "professional-services:consulting",
            label: "Consulting"
          },
          {
            key: "professional-services:design",
            label: "Design"
          },
          {
            key: "professional-services:training",
            label: "Training"
          },
          {
            key: "professional-services:administrative-services",
            label: "Administrative services"
          }
        ]
      }
    ]
  };

  // packages/utils/src/catalog-category-presets.ts
  var normalize = (value) => value.trim().replace(/\s+/g, " ").toLowerCase();
  function validateCatalogCategoryConfig(value) {
    if (!value || typeof value !== "object" || !("schemaVersion" in value) || value.schemaVersion !== 1 || !("categories" in value) || !Array.isArray(value.categories))
      throw new Error("Catalog category config requires schema version 1 and categories.");
    const profileKeys = new Set(BUSINESS_PROFILES.map((profile) => profile.key));
    const keys = new Set;
    const labels = new Set;
    const validText = (text) => typeof text === "string" && Boolean(text.trim()) && text.length <= 80;
    for (const category of value.categories) {
      if (!category || !validText(category.key) || !/^[a-z0-9-]+$/.test(category.key) || !validText(category.label) || !Array.isArray(category.itemKinds) || !category.itemKinds.length || category.itemKinds.some((kind) => kind !== "product" && kind !== "service") || !Array.isArray(category.businessProfileKeys) || category.businessProfileKeys.some((key) => typeof key !== "string" || !profileKeys.has(key)) || !Array.isArray(category.subcategories))
        throw new Error("Catalog category preset has invalid identity, kind or business mapping.");
      if (keys.has(category.key) || labels.has(normalize(category.label)))
        throw new Error("Catalog category preset repeats an identity or root label.");
      keys.add(category.key);
      labels.add(normalize(category.label));
      const childLabels = new Set;
      for (const child of category.subcategories) {
        if (!child || !validText(child.key) || !child.key.startsWith(`${category.key}:`) || !validText(child.label) || keys.has(child.key) || childLabels.has(normalize(child.label)))
          throw new Error("Catalog subcategory requires a unique identity under its parent.");
        keys.add(child.key);
        childLabels.add(normalize(child.label));
      }
    }
    for (const profile of BUSINESS_PROFILES) {
      if (profile.key === "other-mixed-business")
        continue;
      if (!value.categories.some((category) => category.businessProfileKeys.includes(profile.key)))
        throw new Error(`Catalog category config misses business profile ${profile.key}.`);
    }
  }
  function freezeConfig(value) {
    if (value && typeof value === "object") {
      for (const child of Object.values(value))
        freezeConfig(child);
      Object.freeze(value);
    }
    return value;
  }
  validateCatalogCategoryConfig(catalog_category_presets_default);
  var CATALOG_CATEGORY_CONFIG = freezeConfig(catalog_category_presets_default);
  var CATALOG_CATEGORY_PRESETS = CATALOG_CATEGORY_CONFIG.categories;
  function getCatalogCategoryPresets({
    businessProfileKey,
    kind,
    query = "",
    all = false
  }) {
    const search = normalize(query);
    const knownProfile = BUSINESS_PROFILES.some((profile) => profile.key === businessProfileKey);
    return CATALOG_CATEGORY_PRESETS.filter((category) => category.itemKinds.includes(kind) && (all || !knownProfile || businessProfileKey === "other-mixed-business" || category.businessProfileKeys.includes(businessProfileKey ?? "")) && (!search || [
      category.label,
      ...category.subcategories.map((child) => child.label)
    ].some((label) => normalize(label).includes(search))));
  }
  function findCatalogCategoryPreset(key) {
    return CATALOG_CATEGORY_PRESETS.find((category) => category.key === key);
  }

  // artifacts/catalog-setup-mobile-workshop/category-library-entry.ts
  Object.assign(window, { CatalogCategories: { BUSINESS_PROFILES, CATALOG_CATEGORY_CONFIG, getCatalogCategoryPresets, findCatalogCategoryPreset } });
  Object.assign(window, { CatalogGuidance: { resolveCatalogFormGuidance, findCatalogOptionSuggestion, getCatalogOptionSuggestions, getCatalogOptionValueSuggestions, getCatalogOptionValueHint } });
})();
