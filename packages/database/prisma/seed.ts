import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database...");

  await prisma.plan.upsert({
    where: { name: "Free" },
    update: {},
    create: { name: "Free", priceUsd: 0, creditsPerMonth: 100, isDefault: true, features: ["1 channel", "Mock providers", "Community support"] },
  });
  await prisma.plan.upsert({
    where: { name: "Creator" },
    update: {},
    create: { name: "Creator", priceUsd: 39, creditsPerMonth: 1500, features: ["5 channels", "Priority generation", "Email support"] },
  });
  await prisma.plan.upsert({
    where: { name: "Studio" },
    update: {},
    create: { name: "Studio", priceUsd: 149, creditsPerMonth: 8000, features: ["Unlimited channels", "Autopilot (beta)", "Priority support"] },
  });

  const providerDefaults: Array<{ category: string; providerName: string; displayName: string; priority: number }> = [
    { category: "llm", providerName: "anthropic", displayName: "Anthropic Claude", priority: 0 },
    { category: "llm", providerName: "mock-llm", displayName: "Mock LLM", priority: 1 },
    { category: "image", providerName: "openai", displayName: "OpenAI Images", priority: 0 },
    { category: "image", providerName: "mock-image", displayName: "Mock Image", priority: 1 },
    { category: "video", providerName: "runway", displayName: "Runway", priority: 0 },
    { category: "video", providerName: "mock-video", displayName: "Mock Video", priority: 1 },
    { category: "voice", providerName: "elevenlabs", displayName: "ElevenLabs", priority: 0 },
    { category: "voice", providerName: "mock-voice", displayName: "Mock Voice", priority: 1 },
    { category: "music", providerName: "mock-music", displayName: "Mock Music", priority: 0 },
  ];
  for (const p of providerDefaults) {
    await prisma.providerConfig.upsert({
      where: { category_providerName: { category: p.category, providerName: p.providerName } },
      update: {},
      create: { ...p, enabled: true },
    });
  }

  const passwordHash = await bcrypt.hash("password123", 10);
  const demoUser = await prisma.user.upsert({
    where: { email: "demo@channelbase.dev" },
    update: {},
    create: { email: "demo@channelbase.dev", passwordHash, name: "Demo Creator", role: "USER" },
  });
  const adminUser = await prisma.user.upsert({
    where: { email: "admin@channelbase.dev" },
    update: {},
    create: { email: "admin@channelbase.dev", passwordHash, name: "Admin", role: "ADMIN" },
  });

  await prisma.creditWallet.upsert({ where: { userId: demoUser.id }, update: {}, create: { userId: demoUser.id, balance: 5000 } });
  await prisma.creditWallet.upsert({ where: { userId: adminUser.id }, update: {}, create: { userId: adminUser.id, balance: 5000 } });

  const existingChannel = await prisma.channel.findFirst({ where: { userId: demoUser.id, name: "Nova & Pip's Cosmic Backyard" } });
  if (existingChannel) {
    console.log("Demo channel already exists, skipping content seed.");
    await prisma.$disconnect();
    return;
  }

  const sourcePrompt =
    "Create an English YouTube channel for kids aged 4-7 about two funny animals exploring science and space. Create 3 long episodes and 5 Shorts every week.";

  const channel = await prisma.channel.create({
    data: {
      userId: demoUser.id,
      name: "Nova & Pip's Cosmic Backyard",
      tagline: "Big science. Tiny explorers. Endless giggles.",
      status: "ACTIVE",
      language: "en",
      countryTarget: "US",
    },
  });

  await prisma.channelSpecVersion.create({
    data: {
      channelId: channel.id,
      version: 1,
      sourcePrompt,
      isBaseline: true,
      spec: {
        specVersion: 1,
        sourcePrompt,
        identity: {
          channelNameOptions: ["Nova & Pip's Cosmic Backyard", "Tiny Space Explorers", "Backyard Astronauts"],
          channelName: "Nova & Pip's Cosmic Backyard",
          tagline: "Big science. Tiny explorers. Endless giggles.",
          language: "en",
          countryTarget: "US",
          primaryPlatform: "YOUTUBE",
          channelType: "kids-education",
          niche: "kids science & space",
          subNiche: "backyard astronomy for preschoolers",
        },
        audience: {
          targetAgeMin: 4,
          targetAgeMax: 7,
          targetAudienceDescription: "Curious preschoolers and early-elementary kids who love animals and outer space, watching with a parent nearby.",
          educationalLevel: "pre-k to grade 1",
          interests: ["space", "animals", "silly comedy", "simple experiments"],
          parentalConsiderations: "No scary content, no real danger, gentle pacing, positive resolutions.",
        },
        positioning: {
          tone: "silly, warm, curious",
          personality: ["playful", "encouraging", "a little goofy"],
          contentGoals: ["build a loyal preschool audience", "teach basic science/space concepts"],
          monetizationGoals: ["ad revenue", "future merchandise"],
          valueProposition: "The only backyard-sized space show where two funny animal best friends turn real science into giggles.",
        },
        visualStyle: {
          visualStyleDescription: "Bright, rounded, high-contrast flat illustration style with soft gradients, like a modern preschool picture book.",
          thumbnailStyle: "Big expressive character faces, bold 3-4 word headline, high-saturation background",
          colorDirection: "Cosmic purple, warm orange, sunshine yellow, soft cream",
          logoDirection: "Rounded bubble wordmark with a small star/planet accent",
          avatarDirection: "Nova and Pip's faces side by side inside a circular planet frame",
          bannerDirection: "Nova and Pip in the backyard at night looking up at a starry sky with a telescope",
        },
        voiceStyle: {
          voiceStyleDescription: "Warm, energetic narrator plus two distinct playful character voices",
          musicStyle: "Gentle upbeat ukulele-and-synth instrumental",
        },
        contentStrategy: {
          episodeLengthTargetSeconds: 480,
          shortLengthTargetSeconds: 45,
          episodesPerWeek: 3,
          shortsPerWeek: 5,
          contentPillars: ["Space Basics", "Backyard Science Experiments", "Silly Animal Adventures", "Bedtime Star Stories"],
          seriesIdeas: ["Nova's Star of the Week", "Pip's Backyard Lab"],
        },
        publishingStrategy: {
          platforms: ["YOUTUBE"],
          publishingCadenceDescription: "3 long episodes and 5 Shorts every week",
          bestPublishingDays: ["Monday", "Wednesday", "Friday"],
          approvalMode: "MANUAL",
        },
        characters: [
          { name: "Nova", role: "curious fox astronaut", shortDescription: "A bouncy young fox obsessed with stars" },
          { name: "Pip", role: "nervous but brave hedgehog scientist", shortDescription: "A small hedgehog who loves gadgets and experiments" },
        ],
        worlds: [{ name: "The Cosmic Backyard", shortDescription: "A magical backyard that turns into a mini planetarium at night" }],
        contentPillars: ["Space Basics", "Backyard Science Experiments", "Silly Animal Adventures", "Bedtime Star Stories"],
        safetyRules: [{ rule: "No real danger or scary imagery", category: "content" }],
        productionRules: {
          requiresCharacters: true,
          requiresWorldBible: true,
          maxSceneCount: 8,
          captionsRequired: true,
          allowedThemes: ["space", "friendship", "curiosity"],
          disallowedThemes: ["violence", "fear"],
          contentRating: "KIDS",
        },
      },
    },
  });

  const brandData = {
    brandName: "Nova & Pip's Cosmic Backyard",
    tagline: "Big science. Tiny explorers. Endless giggles.",
    brandPersonality: ["playful", "warm", "curious"],
    colorDirection: "Cosmic purple, warm orange, sunshine yellow, soft cream",
    typographyDirection: "Rounded, friendly sans-serif (e.g. Baloo-style) for headings",
    logoPrompt: "A rounded bubble wordmark 'Nova & Pip' with a small orbiting star, cosmic purple and sunshine yellow, flat vector style",
    avatarPrompt: "Nova the fox and Pip the hedgehog's smiling faces side-by-side inside a circular ringed-planet frame, flat vector illustration",
    bannerPrompt: "Nova and Pip sitting on a backyard blanket looking up through a toy telescope at a starry sky full of friendly constellations",
    thumbnailSystemDescription: "Big expressive character close-ups on the right, bold 3-4 word headline top-left, cosmic gradient background",
    visualRules: ["Characters always keep consistent proportions", "Backgrounds always include at least one star or planet motif"],
    brandRules: ["Always end episodes with a warm, encouraging recap"],
    doNotUseRules: ["No scary faces", "No sharp/aggressive shapes", "No dark, low-contrast palettes"],
    style: {
      primaryColors: ["#6D28D9", "#F97316", "#FACC15"],
      secondaryColors: ["#FDF6EC"],
      typography: "Rounded friendly sans-serif",
      logoStyle: "Flat vector bubble wordmark",
      illustrationStyle: "Bright rounded flat illustration, soft gradients, picture-book style",
      lighting: "Soft, warm, glowing starlight",
      backgroundStyle: "Cosmic gradients with simple star/planet motifs",
      compositionRules: ["Rule of thirds", "Characters centered or right-weighted"],
      thumbnailRules: ["Big expressive faces", "3-4 word bold headline", "High saturation"],
    },
  };
  await prisma.brandBible.create({ data: { channelId: channel.id, version: 1, data: brandData } });

  const nova = await prisma.character.create({
    data: {
      channelId: channel.id,
      name: "Nova",
      role: "curious fox astronaut",
      species: "fox",
      genderPresentation: "female-coded",
      ageDescription: "childlike, energetic",
      bodyDescription: "small, bouncy, round-bellied fox",
      faceDescription: "big round eyes, small triangular ears, permanent grin",
      hairDescription: "fluffy orange fur with white chest patch",
      eyeDescription: "big round amber eyes",
      clothingDescription: "small blue astronaut vest with a star patch",
      accessories: ["toy telescope"],
      personality: ["curious", "bouncy", "brave"],
      strengths: ["asks great questions", "always excited to learn"],
      weaknesses: ["gets distracted easily"],
      catchphrases: ["To infinity and my backyard!"],
      speechStyle: "fast, excited, lots of exclamation points",
      visualPrompt:
        "A small round bouncy orange fox character with a white chest patch, big round amber eyes, triangular ears, wearing a small blue astronaut vest with a star patch, flat vector illustration style, consistent proportions across all scenes",
      negativePrompt: "no color changes, no extra limbs, no different outfit, no realistic fur texture",
      consistencyRules: ["Always wears the blue astronaut vest", "Always has the white chest patch"],
      doNotChangeRules: ["Never changes fur color", "Never loses the star patch"],
    },
  });

  const pip = await prisma.character.create({
    data: {
      channelId: channel.id,
      name: "Pip",
      role: "nervous but brave hedgehog scientist",
      species: "hedgehog",
      genderPresentation: "male-coded",
      ageDescription: "childlike, thoughtful",
      bodyDescription: "small round hedgehog with soft rounded spikes",
      faceDescription: "round glasses, small nose, gentle smile",
      hairDescription: "soft brown rounded spikes",
      eyeDescription: "small round dark eyes behind glasses",
      clothingDescription: "tiny lab coat with a gadget belt",
      accessories: ["round glasses", "gadget belt"],
      personality: ["careful", "thoughtful", "secretly brave"],
      strengths: ["great at experiments", "explains things clearly"],
      weaknesses: ["worries before trying new things"],
      catchphrases: ["Let's test that... carefully!"],
      speechStyle: "slower, careful, methodical, warm",
      visualPrompt:
        "A small round brown hedgehog character with soft rounded spikes, round glasses, gentle smile, wearing a tiny white lab coat and gadget belt, flat vector illustration style, consistent proportions across all scenes",
      negativePrompt: "no color changes, no extra limbs, no different outfit, no sharp spikes",
      consistencyRules: ["Always wears round glasses and lab coat"],
      doNotChangeRules: ["Never removes glasses", "Never changes spike color"],
    },
  });

  const world = await prisma.world.create({
    data: {
      channelId: channel.id,
      name: "The Cosmic Backyard",
      description: "A cozy backyard that transforms into a mini planetarium every night, full of friendly constellations.",
      rules: ["Stars can talk gently but never appear scary", "The backyard is always safe and warm"],
    },
  });
  const location = await prisma.location.create({
    data: {
      worldId: world.id,
      name: "The Star Blanket Spot",
      environmentDescription: "A cozy picnic blanket in the backyard at twilight, surrounded by fireflies and a toy telescope on a tripod",
      lighting: "Warm dusk light fading into soft starlight",
      colorPalette: ["#6D28D9", "#1E1B4B", "#FACC15"],
      importantObjects: ["toy telescope", "picnic blanket", "jar of fireflies"],
      visualPrompt: "A cozy backyard picnic blanket at twilight under a starry sky, toy telescope on a tripod, fireflies glowing softly, flat vector illustration",
      negativePrompt: "no scary shadows, no realistic night-time darkness",
    },
  });

  await prisma.storyBible.create({
    data: {
      channelId: channel.id,
      version: 1,
      data: {
        premise: "Nova the fox and Pip the hedgehog turn their backyard into a nightly mission to explore space and science, one silly question at a time.",
        coreThemes: ["curiosity", "friendship", "it's okay to be careful AND brave"],
        educationalObjectives: ["basic space facts", "simple science experiment concepts", "observation skills"],
        characterRelationships: [{ characterAName: "Nova", characterBName: "Pip", relationship: "best friends who balance each other's energy and caution" }],
        worldRules: ["The backyard always transforms safely at dusk", "Every mission ends before bedtime"],
        recurringStoryElements: ["The toy telescope 'activates' each episode", "A friendly star character sometimes visits"],
        forbiddenStoryElements: ["real danger", "characters getting lost or hurt", "scary imagery"],
        continuityNotes: ["Nova always wears her vest; Pip always wears his lab coat and glasses"],
      },
    },
  });

  const contentPlan = await prisma.contentPlan.create({
    data: {
      channelId: channel.id,
      periodStart: new Date(),
      periodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      items: {
        create: [
          {
            titleIdea: "Why Does the Moon Change Shape?? (Backyard Mission #1)",
            concept: "Nova and Pip investigate moon phases using a flashlight and a ball in the backyard.",
            contentPillar: "Space Basics",
            format: "LONG_VIDEO",
            targetDurationSeconds: 480,
            hook: "Nova thinks the moon is being eaten by a monster... Pip has a much sillier explanation!",
            educationalGoal: "Understand that the moon appears to change shape (phases)",
            emotionalGoal: "wonder and giggles",
            targetPublishDate: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000),
            priority: 5,
          },
          {
            titleIdea: "We Built a VOLCANO in the Backyard! (Science Lab #1)",
            concept: "Pip nervously agrees to a baking-soda volcano experiment Nova is way too excited about.",
            contentPillar: "Backyard Science Experiments",
            format: "LONG_VIDEO",
            targetDurationSeconds: 480,
            hook: "Pip says it's 'perfectly safe'... Nova says it's going to be AWESOME.",
            educationalGoal: "Basic chemical reaction (baking soda + vinegar)",
            emotionalGoal: "excitement",
            targetPublishDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
            priority: 4,
          },
          {
            titleIdea: "The Star That Got Lost (Bedtime Star Story #1)",
            concept: "A gentle bedtime story where Nova and Pip help a lost little star find its constellation.",
            contentPillar: "Bedtime Star Stories",
            format: "LONG_VIDEO",
            targetDurationSeconds: 420,
            hook: "A tiny star lands in the backyard and doesn't know its way home!",
            educationalGoal: "What a constellation is",
            emotionalGoal: "cozy and comforting",
            targetPublishDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
            priority: 3,
          },
          ...Array.from({ length: 5 }, (_, i) => ({
            titleIdea: `Pip's 30-Second Space Fact #${i + 1}`,
            concept: "A rapid-fire silly space fact delivered by a very serious Pip, undercut by Nova's reaction.",
            contentPillar: "Space Basics",
            format: "SHORT" as const,
            targetDurationSeconds: 45,
            hook: "Did you know... [surprising space fact]?!",
            targetPublishDate: new Date(Date.now() + (i + 1) * 24 * 60 * 60 * 1000),
            priority: 3,
          })),
        ],
      },
    },
    include: { items: true },
  });

  const firstItem = contentPlan.items[0]!;
  const episode = await prisma.episode.create({
    data: {
      channelId: channel.id,
      contentPlanItemId: firstItem.id,
      title: firstItem.titleIdea,
      format: firstItem.format,
      status: "IDEA",
      targetDurationSeconds: firstItem.targetDurationSeconds,
      targetPublishDate: firstItem.targetPublishDate,
      hook: firstItem.hook,
      summary: firstItem.concept,
    },
  });
  for (const item of contentPlan.items.slice(1, 4)) {
    await prisma.episode.create({
      data: {
        channelId: channel.id,
        contentPlanItemId: item.id,
        title: item.titleIdea,
        format: item.format,
        status: "IDEA",
        targetDurationSeconds: item.targetDurationSeconds,
        targetPublishDate: item.targetPublishDate,
        hook: item.hook,
        summary: item.concept,
      },
    });
  }

  console.log(`Seeded channel "${channel.name}" (${channel.id}) with characters ${nova.name}/${pip.name}, world "${world.name}"/"${location.name}", and episode "${episode.title}".`);
  console.log("Demo login: demo@channelbase.dev / password123");
  console.log("Admin login: admin@channelbase.dev / password123");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
