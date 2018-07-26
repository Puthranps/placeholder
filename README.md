[thank you](https://github.com/owebio/serverless-webrtc-chat) - used as the base
** Confirmed working on device-to-device communication within the same NAT, some complications could arise from having different routing structures at every client's endpoint (to investigate) **
Severing internet connection and refreshing it does not kill the connectivity in some cases, pointing to statefulness being achievable.

Looking to integrate [GunJS](https://gun.eco/#step1) or similar derivative at layer 1-2
____________________________

Free to reuse this

# Servlerless WebRTC data communication

Avoid the use of a back-end to signal WebRTC connection instances between clients, use an intermediary file format that can be transferred via available relays like Messenger, Whatsapp and optionally encrypt the relayed contents to avoid deobfuscation.

this is a work in progress currently, will report as much as needed.

## Use
Load the standalone.html file into a web browser, share the formatted SessionDescriptionProtocol through an alternative media and have the other party respond to it by loading (pasting) it to generate a response and open a session, which you can then in turn use to open the session on your side through loading the opposing SDP.

### Case
This implementation is the skeleton for the logic used in the app that will be served to people and allow them to build networks from integrating at an entry point. For example, a forum website can use this with some sugar coating to provide a lasting peer-to-peer structure for its community members et al..
A native app built with this basic logic can serve as a model to provide simple persistance functions to maintain higher availability and connection strength (not having to copy paste every time through functional improvements of peer-to-peer networking logic in the web browser).

The intended use is simply to design machine-illiterate cryptography through the use of personal questions to completely obfuscate later parts of the connection relationship.

This module could be converted to a simple decrypter that loads in the html decrypted from an image file sent to another person, then enabling the p2p connection and saving details locally (this avoids having a certain degree of tracking, for example I am sending you an encrypted file with plugins developed that only you could have acccess to unless you copy-pasted everything; but then again there exists browser mechanics that could prevent that just like a native application could provide neat functionality).

## Example
Not necessarily available here, but definitely a plan to test this type of flow as it will become increasingly sought after by the average user.

A very basic tool can be downloaded for free from many sources that enables the encryption and decryption of any file through a user-supplied question and answer.
The result of such encryption is a string that can be interpreted only when the appropriate answer is fed to the tool alongside the file string.
After unencryption, the file is simply loaded like any other webpage.

This offers a relatively high level of encryption compared to crackable algorithms. With the use of alternative channels, a much higher degree of privacy is achievable if desired.

A simple encryption tool is really all that is needed, and can be relayed through another encryption method if need be.

task: develop solid encryption protocol that is not sha256-similar, make a tool, start a small network
