import { Container } from "@/components/ui/Container";
import { UtensilsCrossed, Truck, Heart, Leaf } from "lucide-react";

const values = [
  {
    icon: UtensilsCrossed,
    title: "Authentic Recipes",
    description:
      "Traditional Neapolitan recipes prepared with imported Italian ingredients — San Marzano tomatoes, fior di latte, and Tipo 00 flour.",
  },
  {
    icon: Truck,
    title: "Street Food Culture",
    description:
      "We bring the vibrant energy of Italian street food markets to Poland's most beautiful city squares.",
  },
  {
    icon: Heart,
    title: "Made with Passion",
    description:
      "Every dish is crafted with care by our team of passionate cooks who live and breathe Italian cuisine.",
  },
  {
    icon: Leaf,
    title: "Fresh & Quality",
    description:
      "We source the freshest local produce and combine it with the finest imported Italian ingredients.",
  },
];

export function AboutSection() {
  return (
    <section id="about" className="py-20 md:py-28 bg-italia-cream">
      <Container>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          {/* Text */}
          <div>
            <p className="text-italia-red font-medium text-sm tracking-[0.15em] uppercase mb-3">
              Our Story
            </p>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-heading font-bold text-italia-dark leading-tight mb-6">
              From the Heart of{" "}
              <span className="text-italia-red">Naples</span> to the Streets of{" "}
              <span className="text-italia-green">Poland</span>
            </h2>
            <div className="space-y-4 text-italia-gray leading-relaxed">
              <p>
                Sud Italia was born from a simple dream: to share the authentic
                flavors of Southern Italy with Poland. Founded by xyz, a group
                of food enthusiasts with deep roots in Italian culinary
                tradition, we started with a single food truck in Krak&oacute;w.
              </p>
              <p>
                Today, we&apos;re growing across Poland, bringing our signature
                Neapolitan pizza, handmade pasta, and classic Italian street
                food to more cities. Each truck is a small piece of Italy —
                the same recipes, the same passion, the same commitment to
                quality.
              </p>
              <p>
                Whether you&apos;re grabbing a quick slice of Margherita or
                sitting down for a full meal, we want every bite to transport
                you to the sun-drenched streets of Naples.
              </p>
            </div>
          </div>

          {/* Values grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {values.map((value) => (
              <div
                key={value.title}
                className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100"
              >
                <div className="w-12 h-12 rounded-xl bg-italia-red/10 flex items-center justify-center mb-4">
                  <value.icon className="h-6 w-6 text-italia-red" />
                </div>
                <h3 className="font-heading font-semibold text-lg text-italia-dark mb-2">
                  {value.title}
                </h3>
                <p className="text-sm text-italia-gray leading-relaxed">
                  {value.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </Container>
    </section>
  );
}
