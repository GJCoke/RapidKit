<script setup lang="ts">
  import { $t } from "@/locales"
  import type { ClientDetail } from "./types"

  interface Props {
    show: boolean
    client: ClientDetail
  }

  defineProps<Props>()
  const emit = defineEmits(["update:show"])
</script>

<template>
  <n-modal
    :show="show"
    preset="card"
    style="width: 800px; max-width: 95vw"
    :title="$t('page.socketio.instrument.clientDetail')"
    :bordered="false"
    @update:show="(val) => emit('update:show', val)"
    @click.stop
  >
    <div class="flex flex-col gap-6">
      <!-- 基础信息面板 -->
      <n-descriptions
        label-placement="left"
        bordered
        :column="2"
        size="small"
        class="bg-zinc-50/50 dark:bg-zinc-900/50"
      >
        <n-descriptions-item label="Socket ID">
          <n-text code copyable>{{ client.id }}</n-text>
        </n-descriptions-item>
        <n-descriptions-item label="Client ID">
          <n-text code>{{ client.clientId || "-" }}</n-text>
        </n-descriptions-item>
        <n-descriptions-item :label="$t('page.socketio.common.namespace')">
          <n-tag size="small" type="primary" quaternary>{{ client.nsp }}</n-tag>
        </n-descriptions-item>
        <n-descriptions-item :label="$t('page.socketio.instrument.ipAddress')">
          <span class="font-mono">{{ client.handshake.address }}</span>
        </n-descriptions-item>
        <n-descriptions-item :label="$t('page.socketio.common.transport')">
          <n-tag size="small" :type="client.transport === 'websocket' ? 'success' : 'warning'">
            {{ client.transport.toUpperCase() }}
          </n-tag>
        </n-descriptions-item>
        <n-descriptions-item :label="$t('page.socketio.common.connectTime')">
          <span class="text-zinc-500 font-mono">{{ client.handshake.time }}</span>
        </n-descriptions-item>
        <n-descriptions-item :label="$t('page.socketio.common.rooms')" :span="2">
          <div class="flex flex-wrap gap-1">
            <n-tag v-for="room in client.rooms" :key="room" size="small" quaternary round>
              {{ room }}
            </n-tag>
          </div>
        </n-descriptions-item>
      </n-descriptions>

      <!-- 详细数据页签 -->
      <n-tabs type="line" animated size="small">
        <n-tab-pane name="headers" :tab="$t('page.socketio.instrument.httpHeaders')">
          <div class="border dark:border-zinc-800 rounded-md overflow-hidden">
            <n-scrollbar style="max-height: 300px">
              <n-table :single-line="false" size="small" class="text-[11px]">
                <thead>
                  <tr>
                    <th class="w-1/3">Key</th>
                    <th>Value</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(value, key) in client.handshake.headers" :key="key">
                    <td class="font-bold text-zinc-500">{{ key }}</td>
                    <td class="font-mono break-all">{{ value }}</td>
                  </tr>
                </tbody>
              </n-table>
            </n-scrollbar>
          </div>
        </n-tab-pane>

        <n-tab-pane name="query" :tab="$t('page.socketio.instrument.queryParams')">
          <div class="bg-zinc-100 dark:bg-zinc-800 p-3 rounded-md border dark:border-zinc-700">
            <pre class="text-[11px] font-mono">{{ JSON.stringify(client.handshake.query, null, 2) }}</pre>
          </div>
        </n-tab-pane>
      </n-tabs>
    </div>
  </n-modal>
</template>
