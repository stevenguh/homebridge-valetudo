# Homebridge Valetudo

A zero-config Homebridge plugin for [Valetudo](https://valetudo.cloud) robot vacuums.

## Matter Mode

Requires Homebridge 2.0+ with Matter enabled.

Pair the Matter bridge after first enabling Matter in Homebridge. The vacuum will not appear in the Homebridge UI in this mode.

## Fan Mode (fallback)

When Matter is unavailable, the vacuum is exposed as a HomeKit fan with basic controls:

- Start and pause
- Fan speed
- Battery level
- Speaker volume
- Filter indicator

## Development

- [Homebridge plugin development](https://github.com/homebridge/homebridge#plugin-development)
- [Node locations on Raspberry Pi](https://www.reddit.com/r/homebridge/comments/vusfib/homebridge_and_npm_node_locations_on_raspberry_pi/)

You can also copy the built `homebridge-valetudo` directory into `/var/lib/homebridge/node_modules` on a Raspberry Pi, ensuring the correct owner and group.
