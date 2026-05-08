# duplicati-monitoring

Simple bridge to display [Duplicati](https://duplicati.com/) backups status in Home Assistant.

## Start the bridge

```sh
bun install
bun run index.ts
```

## Use with Docker compose

```yaml
services:
  duplicati-monitoring:
    build: ./duplicati-monitoring
    container_name: duplicati-monitoring
    ports:
      - '3000:3000'
    volumes:
      - ./data:/app/data
```

## Duplicati config

```
--send-http-json-urls=http://<ip>:3000/backup
```

## Home Assistant sensor

```yaml
sensor:
  - platform: rest
    name: Duplicati Backup
    resource: http://<ip>:3000/status?name=<backup-name>&maxAge=24
    value_template: "{{ value_json.Status }}"
    scan_interval: 600
```

`maxAge` (in hours) will make the sensor return "Late" if no backup result was received in time.

Possible sensor values are "Success", "Error", "Warning" (Duplicati standard), "Missing" (if `name` is not found) and "Late".

Then endpoint actually returns the whole Duplicati report JSON so you can add additional attributes if needed.

## Home Assistant card

Using [auto-entities](https://github.com/thomasloven/lovelace-auto-entities) and [Mushroom](https://github.com/piitaya/lovelace-mushroom). 

```yaml
type: custom:auto-entities
filter:
  include:
    - options:
        type: template
        content: >-
          {{ state_attr(entity, 'friendly_name') }} ({{ states(entity) }})
        icon: >-
          {% if states(entity) == 'Success' %}mdi:check-all
          {% elif states(entity) == 'Error' %}mdi:alert-circle
          {% elif states(entity) == 'Warning' %}mdi:alert
          {% elif states(entity) == 'Missing' %}mdi:help-circle-outline
          {% elif states(entity) == 'Late' %}mdi:timer-alert
          {% endif %}
        icon_color: >-
          {% if states(entity) == 'Success' %}green
          {% elif states(entity) == 'Error' %}red
          {% elif states(entity) == 'Warning' %}orange
          {% elif states(entity) == 'Missing' %}orange
          {% elif states(entity) == 'Late' %}red
          {% endif %}
      entity_id: /^sensor.duplicati_.*$/
      sort:
        method: friendly_name
card:
  type: custom:mushroom-chips-card
  alignment: center
card_param: chips
```
