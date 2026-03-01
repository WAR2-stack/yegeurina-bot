require('dotenv').config();

const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder
} = require('discord.js');

const token = process.env.TOKEN;
const clientId = '1475828957629644976';
const guildId = '1256075997972009010';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMembers
  ]
});

const participants = new Map();
const resetTimers = new Map();


// =======================
// 슬래시 명령어 등록
// =======================

const commands = [
  new SlashCommandBuilder()
    .setName('팀짜기')
    .setDescription('현재 음성채널 인원 팀 분배')
    .addIntegerOption(option =>
      option.setName('팀수')
        .setDescription('몇 팀으로 나눌지')
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('모드')
        .setDescription('팀 구성 방식')
        .setRequired(true)
        .addChoices(
          { name: '전체 자동', value: 'auto' },
          { name: '선택해서 구성', value: 'select' }
        )
    ),

  new SlashCommandBuilder().setName('내전참가').setDescription('내전에 참가합니다'),
  new SlashCommandBuilder().setName('참가취소').setDescription('내전 참가를 취소합니다'),
  new SlashCommandBuilder().setName('내전명단').setDescription('내전 참가자 명단'),
  new SlashCommandBuilder().setName('내전팀짜기').setDescription('내전 팀짜기 결과'),
  new SlashCommandBuilder().setName('내전초기화').setDescription('내전 명단을 초기화합니다')

].map(cmd => cmd.toJSON());

const rest = new REST({ version: '10' }).setToken(token);

(async () => {
  await rest.put(
    Routes.applicationGuildCommands(clientId, guildId),
    { body: commands }
  );
  console.log('슬래시 명령어 등록 완료');
})();


// =============================
// 내전 명령어
// =============================

client.on('interactionCreate', async interaction => {

  if (interaction.isChatInputCommand()) {

    const channelId = interaction.channel.id;
    const userId = interaction.user.id;
    const userName = interaction.member.displayName;

    if (!participants.has(channelId)) {
      participants.set(channelId, new Set());
    }

    const channelParticipants = participants.get(channelId);

    if (interaction.commandName === '내전참가') {

      if (channelParticipants.has(userId)) {
        return interaction.reply({ content: '이미 참가 중입니다.', ephemeral: true });
      }

      channelParticipants.add(userId);

      const names = [...channelParticipants].map(id =>
        interaction.guild.members.cache.get(id)?.displayName
      );

      return interaction.reply(
        `✅ 내전참가 - ${userName}\n현재 인원(${channelParticipants.size}) : ${names.join(', ')}`
      );
    }

    if (interaction.commandName === '참가취소') {

      if (!channelParticipants.has(userId)) {
        return interaction.reply({ content: '참가 기록이 없습니다.', ephemeral: true });
      }

      channelParticipants.delete(userId);

      const names = [...channelParticipants].map(id =>
        interaction.guild.members.cache.get(id)?.displayName
      );

      return interaction.reply(
        `❌ 참가 취소 - ${userName}\n현재 인원(${channelParticipants.size}) : ${names.join(', ') || '없음'}`
      );
    }

    if (interaction.commandName === '내전명단') {

      const names = [...channelParticipants].map(id =>
        interaction.guild.members.cache.get(id)?.displayName
      );

      return interaction.reply(
        `📢 현재 내전 명단\n인원(${channelParticipants.size})\n- ${names.join(\n) || '없음'}`
      );
    }

    if (interaction.commandName === '내전팀짜기') {

      const members = [...channelParticipants];

      if (members.length < 2) {
        return interaction.reply('팀을 나누기엔 인원이 부족합니다.');
      }

      const shuffled = members.sort(() => Math.random() - 0.5);
      const mid = Math.ceil(shuffled.length / 2);

      const team1 = shuffled.slice(0, mid);
      const team2 = shuffled.slice(mid);

      const team1Names = team1.map(id =>
        interaction.guild.members.cache.get(id)?.displayName
      );

      const team2Names = team2.map(id =>
        interaction.guild.members.cache.get(id)?.displayName
      );


// 기존 타이머가 있으면 제거
if (resetTimers.has(channelId)) {
  clearTimeout(resetTimers.get(channelId));
}

// 1시간 후 자동 초기화
const timer = setTimeout(() => {
  const channelParticipants = participants.get(channelId);
  if (channelParticipants) {
    channelParticipants.clear();
    console.log(`⏱ ${channelId} 채널 내전 자동 초기화 완료`);
  }
  resetTimers.delete(channelId);
}, 60 * 60 * 1000); // 1시간

resetTimers.set(channelId, timer);


      return interaction.reply(
        `=== Company ===\n- ${team1Names.join(', ')}\n\n=== Union ===\n- ${team2Names.join(', ')}`
      );
    }

    if (interaction.commandName === '내전초기화') {

      channelParticipants.clear();
 
      return interaction.reply('🗑 현재 채널 내전 명단이 초기화되었습니다.');
    }

    // =========================
    // 팀짜기 명령어
    // =========================

    if (interaction.commandName === '팀짜기') {

      const voiceChannel = interaction.member.voice.channel;

      if (!voiceChannel) {
        return interaction.reply({
          content: '❌ 음성채널에 먼저 들어가세요.',
          ephemeral: true
        });
      }

      const teamCount = interaction.options.getInteger('팀수');
      const mode = interaction.options.getString('모드');

      const members = voiceChannel.members
        .filter(m => !m.user.bot)
        .map(m => m);

      if (members.length < teamCount) {
        return interaction.reply({
          content: '❌ 인원이 팀수보다 적습니다.',
          ephemeral: true
        });
      }

      if (mode === 'auto') {

        const teams = createTeams(members, teamCount);

        let result = '👥 **팀 배정 결과**\n\n';

        teams.forEach((team, i) => {
          result += `🔹 팀 ${i + 1}\n`;
          team.forEach(member => {
            result += `- ${member.displayName}\n`;
          });
          result += '\n';
        });

        return interaction.reply(result);
      }

      if (mode === 'select') {

        const selectMenu = new StringSelectMenuBuilder()
          .setCustomId(`team_select_${teamCount}`)
          .setPlaceholder('참여할 인원 선택')
          .setMinValues(1)
          .setMaxValues(members.length)
          .addOptions(
            members.map(member => ({
              label: member.displayName,
              value: member.id
            }))
          );

        const row = new ActionRowBuilder().addComponents(selectMenu);

        return interaction.reply({
          content: '팀에 참여할 인원을 선택하세요.',
          components: [row],
          ephemeral: true
        });
      }
    }
  }

  // =========================
  // 선택 메뉴 처리
  // =========================

  if (interaction.isStringSelectMenu()) {

    if (!interaction.customId.startsWith('team_select_')) return;

    const teamCount = parseInt(
      interaction.customId.split('_')[2]
    );

    const selectedMembers = interaction.values.map(id =>
      interaction.guild.members.cache.get(id)
    );

    if (selectedMembers.length < teamCount) {
      return interaction.update({
        content: '❌ 선택 인원이 팀수보다 적습니다.',
        components: []
      });
    }

    const teams = createTeams(selectedMembers, teamCount);

    let result = '👥 **팀 배정 결과**\n\n';

    teams.forEach((team, i) => {
      result += `🔹 팀 ${i + 1}\n`;
      team.forEach(member => {
        result += `- ${member.displayName}\n`;
      });
      result += '\n';
    });

    await interaction.update({
      content: '✅ 팀 배정이 완료되었습니다.',
      components: []
    });

    await interaction.channel.send({
      content: result
    });
  }

});


// =======================
// 팀 생성 함수
// =======================

function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function createTeams(members, teamCount) {
  shuffle(members);

  const teams = Array.from({ length: teamCount }, () => []);

  members.forEach((member, i) => {
    teams[i % teamCount].push(member);
  });

  return teams;
}


client.login(token);